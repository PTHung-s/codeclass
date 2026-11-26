/**
 * Socket.IO signaling — giao thức mediasoup đầy đủ.
 *
 * Flow chuẩn (client dùng thư viện mediasoup-client):
 *
 *   1. socket.connect()
 *   2. emit 'mediasoup:join' { roomId, peerName }          → callback { rtpCapabilities, peers }
 *   3. emit 'mediasoup:createSendTransport'                 → callback (transport params)
 *      → client: device.createSendTransport(params)
 *   4. emit 'mediasoup:connectTransport' { dtlsParameters } (transport send)
 *   5. emit 'mediasoup:produce' { kind, rtpParameters }     → callback { producerId }
 *      → server broadcast 'mediasoup:newProducer' cho các peer khác
 *   6. emit 'mediasoup:createRecvTransport'                 → callback (transport params)
 *      → client: device.createRecvTransport(params)
 *   7. emit 'mediasoup:consume' { producerId, rtpCapabilities } → callback { ...consumer params }
 *      → client: recvTransport.consume(params) → MediaStream
 *   8. emit 'mediasoup:resumeConsumer' { consumerId }       (bật consumer sau khi tạo)
 *   9. đóng kết nối → server tự dọn transports/producers/consumers
 *
 * Tất cả event đều dùng pattern (data, callback) — callback({ error }) khi lỗi.
 */
import { Server as SocketIOServer, Socket } from 'socket.io';
import { types as MediasoupTypes } from 'mediasoup';
import crypto from 'crypto';
import { mediasoupService } from './mediasoup.service.js';

/**
 * Verify token HMAC do app-server mint khi room:join. Chung SFU_SHARED_SECRET.
 * Nếu chưa cấu hình secret → coi như tắt auth (chỉ dùng khi dev).
 */
const SFU_SECRET = process.env.SFU_SHARED_SECRET || '';
function verifySfuToken(token: string | undefined, roomId: string): { cid?: string; name?: string } | null {
  if (!SFU_SECRET) return {}; // auth chưa bật
  const parts = (token || '').split('.');
  if (parts.length !== 2) return null;
  const [b, sig] = parts;
  const expect = crypto.createHmac('sha256', SFU_SECRET).update(b).digest('base64url');
  const sb = Buffer.from(sig), eb = Buffer.from(expect);
  if (sb.length !== eb.length || !crypto.timingSafeEqual(sb, eb)) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    if (p.roomId !== roomId) return null;
    return { cid: p.cid, name: p.name };
  } catch {
    return null;
  }
}

interface JoinPayload {
  roomId: string;
  peerName?: string;
  /** socket.id của client trên signaling server — dùng để map stream về đúng người trong app */
  clientPeerId?: string;
  /** token HMAC do app-server cấp — chứng minh đã qua kiểm tra phòng */
  token?: string;
}

export function registerSignaling(io: SocketIOServer): void {
  // Cho phép service broadcast routingChanged tới từng peer
  mediasoupService.setIO(io as never);

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Peer info lưu trên socket để dọn khi disconnect
    let joinedRoomId: string | null = null;
    let clientPeerId: string | null = null;

    /**
     * 1. JOIN — vào phòng: tạo room (router) nếu chưa có, trả rtpCapabilities
     *    để client device.load(). Đồng thời trả danh sách producer đang có
     *    để peer mới consume ngay.
     */
    socket.on('mediasoup:join', async ({ roomId, peerName, clientPeerId: cpId, token }: JoinPayload, cb) => {
      try {
        if (!roomId || typeof roomId !== 'string') {
          return cb?.({ error: 'roomId is required' });
        }

        // Auth: token phải hợp lệ và đúng roomId (chặn người lạ consume stream phòng khác)
        const auth = verifySfuToken(token, roomId);
        if (!auth) {
          console.warn(`⛔ Rejected join "${roomId}" from ${socket.id}: bad token`);
          return cb?.({ error: 'Unauthorized' });
        }

        // Ghost-room cleanup: nếu socket đang ở phòng khác, rời + dọn phòng cũ trước
        if (joinedRoomId && joinedRoomId !== roomId) {
          io.to(joinedRoomId).emit('mediasoup:peerLeft', { peerId: socket.id, clientPeerId });
          mediasoupService.removePeer(joinedRoomId, socket.id);
          await socket.leave(joinedRoomId);
        }

        await socket.join(roomId);
        await mediasoupService.getOrCreateRoom(roomId);
        // clientPeerId ưu tiên lấy từ token (chống giả mạo id)
        clientPeerId = auth.cid || cpId || null;
        mediasoupService.addPeer(roomId, socket.id, { clientPeerId, peerName: auth.name || peerName });
        joinedRoomId = roomId;

        const room = mediasoupService.getRoom(roomId)!;
        const existingProducers = mediasoupService
          .getOtherProducers(roomId, socket.id)
          .filter((p) => {
            const pType = (p.appData as { type?: string }).type;
            if (pType === 'screen') {
              const ownerCid = (p.appData as { clientPeerId?: string }).clientPeerId;
              return mediasoupService.canConsumeScreen(roomId, socket.id, ownerCid);
            }
            return true;
          })
          .map((p) => ({
            producerId: p.id,
            peerId: (p.appData as { peerId?: string }).peerId,
            clientPeerId: (p.appData as { clientPeerId?: string }).clientPeerId,
            peerName: (p.appData as { peerName?: string }).peerName,
            kind: p.kind,
            type: (p.appData as { type?: string }).type,
          }));

        // Thông báo cho các peer KHÁC trong phòng
        socket.to(roomId).emit('mediasoup:peerJoined', {
          peerId: socket.id,
          clientPeerId,
          peerName: auth.name || peerName || socket.id,
        });

        cb?.({
          ok: true,
          rtpCapabilities: room.router.rtpCapabilities,
          existingProducers,
          peers: Array.from(room.peers.keys()).filter((id) => id !== socket.id),
        });

        // Gửi định tuyến âm thanh hiện hành cho MỌI peer (kể cả peer mới) để đồng bộ
        mediasoupService.broadcastRouting(roomId);
      } catch (err) {
        console.error('mediasoup:join error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 2. CREATE SEND TRANSPORT — cho peer ĐỰA stream lên (audio/video/screen)
     */
    socket.on('mediasoup:createSendTransport', async (_data, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const params = await mediasoupService.createWebRtcTransport(
          joinedRoomId,
          socket.id,
          false, // consuming = false → send transport
        );
        cb?.(params);
      } catch (err) {
        console.error('createSendTransport error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 3. CREATE RECV TRANSPORT — để peer NHẬN stream từ SFU
     */
    socket.on('mediasoup:createRecvTransport', async (_data, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const params = await mediasoupService.createWebRtcTransport(
          joinedRoomId,
          socket.id,
          true, // consuming = true → recv transport
        );
        cb?.(params);
      } catch (err) {
        console.error('createRecvTransport error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 4. CONNECT TRANSPORT — client gửi dtlsParameters sau khi
     *    device.createXxxTransport() emit sự kiện 'connect'.
     */
    socket.on('mediasoup:connectTransport', async (
      { transportId, dtlsParameters }: {
        transportId: string;
        dtlsParameters: MediasoupTypes.DtlsParameters;
      },
      cb,
    ) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        if (!peer) return cb?.({ error: 'Peer not found' });

        const transport =
          peer.sendTransport?.id === transportId ? peer.sendTransport :
          peer.recvTransport?.id === transportId ? peer.recvTransport : undefined;

        if (!transport) return cb?.({ error: `Transport ${transportId} not found` });

        await transport.connect({ dtlsParameters });
        cb?.({ ok: true });
      } catch (err) {
        console.error('connectTransport error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 5. PRODUCE — peer đẩy track lên (audio/video/screen).
     *    Sau khi tạo thành công, broadcast cho các peer khác để họ consume.
     */
    socket.on('mediasoup:produce', async (
      { transportId, kind, rtpParameters, appData }: {
        transportId: string;
        kind: MediasoupTypes.MediaKind;
        rtpParameters: MediasoupTypes.RtpParameters;
        appData?: Record<string, unknown>;
      },
      cb,
    ) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        if (!peer) return cb?.({ error: 'Peer not found' });
        if (peer.sendTransport?.id !== transportId) {
          return cb?.({ error: 'Invalid transportId (must be send transport)' });
        }

        const producer = await peer.sendTransport.produce({
          kind,
          rtpParameters,
          appData: {
            ...appData,
            peerId: socket.id,
            clientPeerId: peer.clientPeerId,
            peerName: (appData as { peerName?: string } | undefined)?.peerName || peer.peerName,
            type: (appData as { type?: string } | undefined)?.type,
          },
        });

        peer.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
          producer.close();
          peer.producers.delete(producer.id);
        });

        // Báo cho các peer được phép: có stream mới để consume
        const producerPayload = {
          producerId: producer.id,
          peerId: socket.id,
          clientPeerId: peer.clientPeerId,
          peerName: producer.appData.peerName,
          kind: producer.kind,
          type: (producer.appData as { type?: string }).type,
        };
        if (producerPayload.type === 'screen') {
          const roomObj = mediasoupService.getRoom(joinedRoomId);
          if (roomObj) {
            for (const other of roomObj.peers.values()) {
              if (other.id === socket.id) continue;
              if (!mediasoupService.canConsumeScreen(joinedRoomId, other.id, peer.clientPeerId)) continue;
              io.to(other.id).emit('mediasoup:newProducer', producerPayload);
            }
          }
        } else {
          socket.to(joinedRoomId).emit('mediasoup:newProducer', producerPayload);
        }

        console.log(`📤 Producer ${producer.id} (${kind}) from peer ${socket.id}`);
        // Producer audio mới → tính lại ai được nghe
        if (kind === 'audio') mediasoupService.broadcastRouting(joinedRoomId);
        cb?.({ ok: true, producerId: producer.id });
      } catch (err) {
        console.error('produce error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 6. CONSUME — peer nhận stream của producer khác.
     *    Client phải gửi rtpCapabilities của device để server kiểm tra
     *    router.canConsume() trước khi tạo consumer.
     */
    socket.on('mediasoup:consume', async (
      { transportId, producerId, rtpCapabilities }: {
        transportId: string;
        producerId: string;
        rtpCapabilities: MediasoupTypes.RtpCapabilities;
      },
      cb,
    ) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const room = mediasoupService.getRoom(joinedRoomId);
        const peer = room?.peers.get(socket.id);
        if (!room || !peer) return cb?.({ error: 'Peer not found' });
        if (peer.recvTransport?.id !== transportId) {
          return cb?.({ error: 'Invalid transportId (must be recv transport)' });
        }

        // Tìm producer trong toàn bộ room (mọi peer)
        let producer: MediasoupTypes.Producer | undefined;
        for (const p of room.peers.values()) {
          const found = p.producers.get(producerId);
          if (found) { producer = found; break; }
        }
        if (!producer) return cb?.({ error: `Producer ${producerId} not found` });

        if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
          return cb?.({ error: 'Client cannot consume this producer (codec mismatch)' });
        }

        // Gate ÂM THANH theo nhóm: nếu đang bật nhóm và 2 bên không cùng nhóm → từ chối
        const ownerCid = (producer.appData as { clientPeerId?: string }).clientPeerId;
        const pType = (producer.appData as { type?: string }).type;
        if (producer.kind === 'audio' &&
            !mediasoupService.canConsumeAudio(joinedRoomId, socket.id, ownerCid)) {
          return cb?.({ error: 'not-audible' });
        }

        // Gate MÀN HÌNH khi đang giám sát thi: học sinh không được consume màn hình bạn khác
        if (pType === 'screen' && !mediasoupService.canConsumeScreen(joinedRoomId, socket.id, ownerCid)) {
          return cb?.({ error: 'screen-restricted' });
        }

        const consumer = await peer.recvTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true, // client phải resume sau khi gắn track
          appData: {
            peerId: socket.id,
            producerPeerId: (producer.appData as { peerId?: string }).peerId,
            producerClientPeerId: ownerCid,
            producerType: pType,
          },
        });

        peer.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          peer.consumers.delete(consumer.id);
        });
        consumer.on('producerclose', () => {
          peer.consumers.delete(consumer.id);
          // Stream nguồn bị đóng (peer ngừng share) → báo client gỡ UI
          socket.emit('mediasoup:producerClosed', { producerId, consumerId: consumer.id });
        });

        cb?.({
          ok: true,
          consumerId: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
          producerKind: producer.kind,
          producerType: (producer.appData as { type?: string }).type,
          producerPeerId: (producer.appData as { peerId?: string }).peerId,
          producerClientPeerId: (producer.appData as { clientPeerId?: string }).clientPeerId,
          producerPeerName: (producer.appData as { peerName?: string }).peerName,
        });
      } catch (err) {
        console.error('consume error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 7. RESUME CONSUMER — consumer được tạo paused:true, client gọi sau khi
     *    đã gắn track vào <video>/<audio> để không mất frame đầu.
     */
    socket.on('mediasoup:resumeConsumer', async ({ consumerId }: { consumerId: string }, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) return cb?.({ error: `Consumer ${consumerId} not found` });

        await consumer.resume();
        cb?.({ ok: true });
      } catch (err) {
        console.error('resumeConsumer error:', err);
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 8. PAUSE / CLOSE CONSUMER (tùy chọn — tối ưu băng thông phía client)
     */
    socket.on('mediasoup:pauseConsumer', async ({ consumerId }: { consumerId: string }, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) return cb?.({ error: `Consumer ${consumerId} not found` });
        await consumer.pause();
        cb?.({ ok: true });
      } catch (err) {
        cb?.({ error: (err as Error).message });
      }
    });

    socket.on('mediasoup:closeConsumer', async ({ consumerId }: { consumerId: string }, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer || !peer) return cb?.({ error: `Consumer ${consumerId} not found` });
        consumer.close();
        peer.consumers.delete(consumerId);
        cb?.({ ok: true });
      } catch (err) {
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 9. CLOSE PRODUCER — peer ngừng share (tắt cam/mic/screen).
     *    Server broadcast để các peer gỡ stream khỏi UI.
     */
    socket.on('mediasoup:closeProducer', async ({ producerId }: { producerId: string }, cb) => {
      try {
        if (!joinedRoomId) return cb?.({ error: 'Join a room first' });
        const peer = mediasoupService.getPeer(joinedRoomId, socket.id);
        const producer = peer?.producers.get(producerId);
        if (!producer) return cb?.({ error: `Producer ${producerId} not found` });

        producer.close();
        peer!.producers.delete(producerId);
        socket.to(joinedRoomId).emit('mediasoup:producerClosed', { producerId });
        if (producer.kind === 'audio') mediasoupService.broadcastRouting(joinedRoomId);
        cb?.({ ok: true });
      } catch (err) {
        cb?.({ error: (err as Error).message });
      }
    });

    /**
     * 9b. PAUSE/RESUME PRODUCER — tạm dừng gửi media (mute) mà giữ producer.
     *     Bản thân client pause producer của mình; server chỉ cần relay trạng thái
     *     qua appData — nhưng mediasoup-client pause() hoạt động local nên 2 event
     *     này chỉ cần tồn tại cho API đồng bộ (no-op an toàn).
     */
    socket.on('mediasoup:pauseProducer', ({ producerId }: { producerId: string }, cb) => {
      const peer = joinedRoomId ? mediasoupService.getPeer(joinedRoomId, socket.id) : undefined;
      const producer = peer?.producers.get(producerId);
      if (!producer) return cb?.({ error: `Producer ${producerId} not found` });
      producer.pause();
      cb?.({ ok: true });
    });

    socket.on('mediasoup:resumeProducer', ({ producerId }: { producerId: string }, cb) => {
      const peer = joinedRoomId ? mediasoupService.getPeer(joinedRoomId, socket.id) : undefined;
      const producer = peer?.producers.get(producerId);
      if (!producer) return cb?.({ error: `Producer ${producerId} not found` });
      producer.resume();
      cb?.({ ok: true });
    });

    /**
     * DISCONNECT — dọn toàn bộ tài nguyên của peer.
     * Đóng send/recv transport → tự đóng mọi producer/consumer.
     */
    socket.on('disconnect', async () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      if (!joinedRoomId) return;

      io.to(joinedRoomId).emit('mediasoup:peerLeft', { peerId: socket.id, clientPeerId });
      mediasoupService.removePeer(joinedRoomId, socket.id);
      mediasoupService.broadcastRouting(joinedRoomId); // peer đi → cập nhật danh sách nghe
    });
  });
}
