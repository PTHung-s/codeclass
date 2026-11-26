/**
 * Quản lý mediasoup Workers và Rooms (Router).
 *
 * Kiến trúc:
 *   Worker (tiến trình C++, 1 core)  →  Router (= 1 phòng)  →  Transports  →  Producers/Consumers
 *
 * - Nhiều worker để tận dụng nhiều core; room được gán round-robin.
 * - Người dùng API không cần biết chi tiết worker/router — chỉ thao tác theo roomId/peerId.
 */
import * as mediasoup from 'mediasoup';
import type {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  IceParameters,
  IceCandidate,
  DtlsParameters,
  RtpCapabilities,
  MediaKind,
  RtpParameters,
  WebRtcTransportOptions,
  TransportListenIp,
} from 'mediasoup/types';
import { config } from './config.js';

export interface Peer {
  id: string;                    // = socket.id của peer trên SFU socket
  roomId: string;
  /** socket.id của peer trên signaling server (app video-call) — để client map stream đúng người */
  clientPeerId?: string;
  peerName?: string;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

export interface Room {
  id: string;
  router: Router;
  peers: Map<string, Peer>;
  createdAt: number;
  /** Callback khi room trống (không còn peer) — do index.ts đăng ký để tự dọn */
  onEmpty?: (roomId: string) => void;
  /**
   * Định tuyến âm thanh: null = full mesh (ai cũng nghe ai).
   * Set<clientPeerId> = chỉ những peer trong set được nghe lẫn nhau (video không ảnh hưởng).
   */
  activeAudioGroup?: Set<string> | null;
  /**
   * Định tuyến bất đối xứng theo luật "Nghe host":
   *  - hostId nghe mọi người (hoặc CHỈ người thuộc allowed nếu hostFocus=true)
   *  - học sinh nghe được host ⇔ thuộc allowed
   *  - học sinh A nghe học sinh B ⇔ A và B cùng thuộc allowed
   */
  asymmetricAudio?: { hostId: string; allowed: Set<string>; hostFocus?: boolean } | null;
  /**
   * Chính sách riêng tư chia sẻ màn hình khi giám sát thi:
   *  - Khi monitoring=true: Host xem được mọi màn hình; học sinh CHỈ xem được màn hình
   *    của Host hoặc màn hình đang được Host ghim (pinnedScreenId).
   */
  examPolicy?: {
    monitoring: boolean;
    hostId: string | null;
    pinnedScreenId: string | null;
  } | null;
}

class MediasoupService {
  private workers: Worker[] = [];
  private nextWorkerIdx = 0;
  private rooms = new Map<string, Room>();
  private io: { to: (room: string) => { emit: (ev: string, data: unknown) => void }; sockets: { get: (id: string) => { emit: (ev: string, data: unknown) => void } | undefined } } | null = null;

  /** Đăng ký Socket.IO server để broadcast routingChanged. */
  setIO(io: MediasoupService['io']): void { this.io = io; }

  /** Khởi tạo các worker khi server start */
  async init(): Promise<void> {
    for (let i = 0; i < config.worker.numWorkers; i++) {
      await this.createWorker();
    }
  }

  /** Tạo 1 worker; khi worker chết thì cô lập + spawn worker mới thay thế. */
  private async createWorker(): Promise<Worker> {
    const worker = await mediasoup.createWorker({
      logLevel: config.worker.logLevel,
      logTags: config.worker.logTags,
      rtcMinPort: config.worker.rtcMinPort,
      rtcMaxPort: config.worker.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error(`❌ mediasoup worker ${worker.pid} died`);
      // Cô lập: loại worker chết khỏi pool, KHÔNG thoát cả tiến trình nếu còn worker khác.
      this.workers = this.workers.filter((w) => w !== worker);
      if (this.workers.length === 0) {
        console.error('❌ Không còn worker nào — thoát trong 2s.');
        setTimeout(() => process.exit(1), 2000);
        return;
      }
      console.error(`⚠️ Còn ${this.workers.length} worker — spawn worker mới thay thế.`);
      this.createWorker().catch((e) => console.error('respawn worker failed:', e));
    });

    this.workers.push(worker);
    console.log(`✅ mediasoup worker created [pid:${worker.pid}] (${this.workers.length} workers)`);
    return worker;
  }

  /** Chọn worker round-robin */
  private nextWorker(): Worker {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  /** Tạo room mới (1 router). Trả về room hiện có nếu đã tồn tại. */
  async getOrCreateRoom(roomId: string): Promise<Room> {
    let room = this.rooms.get(roomId);
    if (room) return room;

    const worker = this.nextWorker();
    const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });

    room = {
      id: roomId,
      router,
      peers: new Map(),
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);

    router.on('@close', () => {
      this.rooms.delete(roomId);
      console.log(`🗑️ Router closed, room "${roomId}" removed`);
    });

    console.log(`🎥 Room "${roomId}" created on worker [pid:${worker.pid}]`);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  listRooms(): Array<{ id: string; peerCount: number; producerCount: number; createdAt: number }> {
    return Array.from(this.rooms.values()).map((r) => ({
      id: r.id,
      peerCount: r.peers.size,
      producerCount: Array.from(r.peers.values()).reduce((n, p) => n + p.producers.size, 0),
      createdAt: r.createdAt,
    }));
  }

  /** Thêm peer (đã join signaling room) vào room mediasoup */
  addPeer(
    roomId: string,
    peerId: string,
    meta?: { clientPeerId?: string | null; peerName?: string | null },
  ): Peer {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room "${roomId}" not found`);

    let peer = room.peers.get(peerId);
    if (!peer) {
      peer = {
        id: peerId,
        roomId,
        clientPeerId: meta?.clientPeerId ?? undefined,
        peerName: meta?.peerName ?? undefined,
        producers: new Map(),
        consumers: new Map(),
      };
      room.peers.set(peerId, peer);
      console.log(`👤 Peer "${peerId}" (client "${meta?.clientPeerId}") joined room "${roomId}" (${room.peers.size} peers)`);
    } else {
      // cập nhật meta nếu peer reconnect
      if (meta?.clientPeerId) peer.clientPeerId = meta.clientPeerId;
      if (meta?.peerName) peer.peerName = meta.peerName;
    }
    return peer;
  }

  getPeer(roomId: string, peerId: string): Peer | undefined {
    return this.rooms.get(roomId)?.peers.get(peerId);
  }

  /**
   * Peer rời phòng: đóng transports (tự đóng producer/consumer bên trong),
   * xóa peer; nếu room trống thì đóng router (giải phóng worker) và gọi onEmpty.
   */
  removePeer(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(peerId);
    if (!peer) return;

    peer.sendTransport?.close();
    peer.recvTransport?.close();
    room.peers.delete(peerId);
    console.log(`👤 Peer "${peerId}" left room "${roomId}" (${room.peers.size} peers left)`);

    if (room.peers.size === 0) {
      room.onEmpty?.(roomId);
      if (this.rooms.get(roomId)) {
        room.router.close();
      }
    }
  }

  /**
   * Tạo WebRtcTransport cho peer (send hoặc recv).
   * Trả về tham số để client device.createSendTransport/createRecvTransport.
   */
  async createWebRtcTransport(
    roomId: string,
    peerId: string,
    consuming: boolean,
  ): Promise<WebRtcTransportOptions & {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
  }> {
    const room = this.getRoom(roomId);
    if (!room) throw new Error(`Room "${roomId}" not found`);
    const peer = room.peers.get(peerId);
    if (!peer) throw new Error(`Peer "${peerId}" not found in room "${roomId}"`);

    const {
      listenIps,
      initialAvailableOutgoingBitrate,
    } = config.webRtcTransport;

    const transport = await room.router.createWebRtcTransport({
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
      appData: { peerId, consuming },
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        console.log(`🔒 Transport ${transport.id} DTLS closed (peer ${peerId})`);
        transport.close();
      }
    });

    transport.on('@close', () => {
      console.log(`🗑️ Transport ${transport.id} closed (peer ${peerId}, consuming=${consuming})`);
    });

    if (consuming) {
      peer.recvTransport?.close(); // đóng transport cũ để không rò rỉ UDP port
      peer.recvTransport = transport;
    } else {
      peer.sendTransport?.close();
      peer.sendTransport = transport;
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    } as never;
  }

  /** Danh sách producer của CÁC PEER KHÁC trong cùng room (để peer mới consume) */
  getOtherProducers(roomId: string, peerId: string): Producer[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const result: Producer[] = [];
    for (const peer of room.peers.values()) {
      if (peer.id === peerId) continue;
      for (const producer of peer.producers.values()) {
        result.push(producer);
      }
    }
    return result;
  }

  // ─── Định tuyến ÂM THANH theo nhóm (video không bị gate) ───────────

  /** Kiểm tra 1 consumer có clientPeerId `meCid` có được phép nghe producer của `ownerCid` không. */
  private isAudioAllowed(room: Room, meCid?: string, ownerCid?: string): boolean {
    if (room.asymmetricAudio) {
      const { hostId, allowed, hostFocus } = room.asymmetricAudio;
      if (!meCid || !ownerCid) return false;
      if (meCid === hostId) return hostFocus ? allowed.has(ownerCid) : true;
      if (ownerCid === hostId) return allowed.has(meCid);
      return allowed.has(meCid) && allowed.has(ownerCid);
    }
    if (room.activeAudioGroup) {
      return !!meCid && !!ownerCid && room.activeAudioGroup.has(meCid) && room.activeAudioGroup.has(ownerCid);
    }
    return true;
  }

  /** Danh sách audio-producer mà 1 peer ĐƯỢC PHÉP nghe (theo activeAudioGroup hoặc asymmetricAudio). */
  audibleAudioFor(roomId: string, peerSocketId: string): { producerId: string; clientPeerId?: string }[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const me = room.peers.get(peerSocketId);
    if (!me) return [];

    const out: { producerId: string; clientPeerId?: string }[] = [];
    for (const peer of room.peers.values()) {
      if (peer.id === peerSocketId) continue;
      if (!this.isAudioAllowed(room, me.clientPeerId, peer.clientPeerId)) continue;
      for (const producer of peer.producers.values()) {
        if (producer.kind === 'audio') {
          out.push({ producerId: producer.id, clientPeerId: peer.clientPeerId });
        }
      }
    }
    return out;
  }

  /** Kiểm tra 1 yêu cầu consume audio có được phép không (video luôn true). */
  canConsumeAudio(roomId: string, consumerSocketId: string, producerOwnerClientPeerId?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const me = room.peers.get(consumerSocketId);
    if (!me) return false;
    return this.isAudioAllowed(room, me.clientPeerId, producerOwnerClientPeerId);
  }

  /** Đặt nhóm âm thanh đang bật (null = cả lớp) rồi broadcast cho mọi peer. */
  setRouting(roomId: string, group: string[] | null): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.asymmetricAudio = null;
    room.activeAudioGroup = group ? new Set(group) : null;
    this.broadcastRouting(roomId);
  }

  /** Đặt định tuyến bất đối xứng ("Nghe host") trên SFU rồi broadcast cho mọi peer. */
  setAsymmetricRouting(roomId: string, hostId: string, hearHost: string[], hostFocus = false): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.activeAudioGroup = null;
    room.asymmetricAudio = { hostId, allowed: new Set(hearHost), hostFocus: !!hostFocus };
    this.broadcastRouting(roomId);
  }

  /** Gửi cho từng peer biết danh sách audio-producer họ được nghe. */
  broadcastRouting(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !this.io) return;
    for (const peer of room.peers.values()) {
      const sock = this.io.sockets.get(peer.id);
      if (!sock) continue;
      sock.emit('mediasoup:routingChanged', { audio: this.audibleAudioFor(roomId, peer.id) });
    }
  }

  /** Kiểm tra 1 peer có được phép consume luồng màn hình (`type='screen'`) của `ownerCid` không. */
  canConsumeScreen(roomId: string, consumerSocketId: string, ownerCid?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.examPolicy?.monitoring) return true;
    const me = room.peers.get(consumerSocketId);
    if (!me) return false;
    const { hostId, pinnedScreenId } = room.examPolicy;
    if (hostId && me.clientPeerId === hostId) return true;
    if (!ownerCid) return false;
    if (hostId && ownerCid === hostId) return true;
    if (pinnedScreenId && ownerCid === pinnedScreenId) return true;
    return false;
  }

  /** Cập nhật chính sách màn hình thi cử: đóng ngay consumer trái phép & đẩy newProducer cho màn hình mới được ghim. */
  setExamPolicy(
    roomId: string,
    policy: { monitoring: boolean; hostId: string | null; pinnedScreenId: string | null },
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.examPolicy = {
      monitoring: !!policy.monitoring,
      hostId: policy.hostId || null,
      pinnedScreenId: policy.pinnedScreenId || null,
    };

    for (const peer of room.peers.values()) {
      const sock = this.io?.sockets.get(peer.id);
      // 1) Đóng mọi screen consumer không còn được phép xem
      for (const [consumerId, consumer] of [...peer.consumers.entries()]) {
        const appData = consumer.appData as {
          producerType?: string;
          producerClientPeerId?: string;
        };
        if (appData?.producerType !== 'screen') continue;
        if (!this.canConsumeScreen(roomId, peer.id, appData.producerClientPeerId)) {
          const producerId = consumer.producerId;
          try { consumer.close(); } catch { /* noop */ }
          peer.consumers.delete(consumerId);
          sock?.emit('mediasoup:producerClosed', { producerId, consumerId });
        }
      }

      // 2) Nếu có screen producer hiện được phép xem nhưng peer chưa consume → phát newProducer
      if (!sock) continue;
      const consumedProducerIds = new Set<string>();
      for (const c of peer.consumers.values()) consumedProducerIds.add(c.producerId);

      for (const other of room.peers.values()) {
        if (other.id === peer.id) continue;
        for (const producer of other.producers.values()) {
          const pType = (producer.appData as { type?: string }).type;
          if (pType !== 'screen') continue;
          if (consumedProducerIds.has(producer.id)) continue;
          const ownerCid = (producer.appData as { clientPeerId?: string }).clientPeerId;
          if (!this.canConsumeScreen(roomId, peer.id, ownerCid)) continue;
          sock.emit('mediasoup:newProducer', {
            producerId: producer.id,
            peerId: other.id,
            clientPeerId: ownerCid,
            peerName: (producer.appData as { peerName?: string }).peerName,
            kind: producer.kind,
            type: pType,
          });
        }
      }
    }
  }

  /** Tất cả room trong tất cả worker — để dọn dẹp khi shutdown */
  async closeAll(): Promise<void> {
    for (const room of this.rooms.values()) {
      for (const peer of room.peers.values()) {
        peer.sendTransport?.close();
        peer.recvTransport?.close();
      }
      room.peers.clear();
      room.router.close();
    }
    this.rooms.clear();
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
  }
}

export const mediasoupService = new MediasoupService();
