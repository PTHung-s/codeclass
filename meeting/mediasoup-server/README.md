# mediasoup-server

Standalone WebRTC **SFU service** dùng [mediasoup](https://mediasoup.org) — tách riêng khỏi app `video-call`, expose REST API + Socket.IO signaling để app chính kết nối vào.

```
Browser (mediasoup-client) ──Socket.IO signaling──► mediasoup-server (Node.js)
                            └───── RTP/SRTP media ─────► mediasoup worker (C++)
```

## Kiến trúc

| Thành phần | Vai trò |
|---|---|
| `src/index.ts` | Entry point — khởi động workers, HTTP server, Socket.IO |
| `src/config.ts` | Cấu hình tập trung (đọc `.env`) |
| `src/mediasoup.service.ts` | Quản lý Worker / Room (Router) / Peer / Transport |
| `src/socket.handler.ts` | Signaling protocol: join, transport, produce, consume |
| `src/rest.routes.ts` | REST API: health, list/delete rooms |

Mỗi room = 1 mediasoup **Router** trên 1 **Worker** (1 core CPU). Workers được chọn round-robin.

## API

### Socket.IO signaling (kênh chính cho media)

Client dùng thư viện [`mediasoup-client`](https://mediasoup.org/documentation/v3/mediasoup-client/). Flow:

```js
import { Device } from 'mediasoup-client';
import { io } from 'socket.io-client';

const socket = io('http://<server>:4443');

// 1. Join room — nhận rtpCapabilities để load device
const { rtpCapabilities, existingProducers } = await socket
  .emitWithAck('mediasoup:join', { roomId: 'abc123', peerName: 'Hung' });
// existingProducers: stream đã có trong phòng (peer vào sau vẫn thấy peer trước)

const device = new Device();
await device.load({ routerRtpCapabilities: rtpCapabilities });

// 2. Tạo send transport + produce (đẩy cam/mic lên)
const sendParams = await socket.emitWithAck('mediasoup:createSendTransport', {});
const sendTransport = device.createSendTransport(sendParams);

sendTransport.on('connect', ({ dtlsParameters }, callback) => {
  socket.emit('mediasoup:connectTransport',
    { transportId: sendTransport.id, dtlsParameters }, callback);
});
sendTransport.on('produce', ({ kind, rtpParameters }, callback) => {
  socket.emit('mediasoup:produce',
    { transportId: sendTransport.id, kind, rtpParameters, appData: { peerName: 'Hung' } },
    ({ producerId }) => callback({ id: producerId }));
});

const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
for (const track of stream.getTracks()) {
  await sendTransport.produce({ track });
}

// 3. Nhận stream của người khác
socket.on('mediasoup:newProducer', async ({ producerId, peerId, kind }) => {
  const recvParams = await socket.emitWithAck('mediasoup:createRecvTransport', {});
  const recvTransport = device.createRecvTransport(recvParams);
  recvTransport.on('connect', ({ dtlsParameters }, callback) => {
    socket.emit('mediasoup:connectTransport',
      { transportId: recvTransport.id, dtlsParameters }, callback);
  });

  const data = await socket.emitWithAck('mediasoup:consume',
    { transportId: recvTransport.id, producerId, rtpCapabilities: device.rtpCapabilities });

  const consumer = await recvTransport.consume({
    id: data.consumerId,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters,
  });
  await socket.emitWithAck('mediasoup:resumeConsumer', { consumerId: data.consumerId });

  // consumer.track → gắn vào <video>/<audio> theo data.producerPeerId
});

// 4. Ngừng share / rời phòng — server tự dọn khi disconnect,
//    hoặc chủ động gọi:
// socket.emitWithAck('mediasoup:closeProducer', { producerId });
```

**Event server → client:** `mediasoup:peerJoined`, `mediasoup:peerLeft`, `mediasoup:newProducer`, `mediasoup:producerClosed`

**Event client → server:** `mediasoup:join`, `mediasoup:createSendTransport`, `mediasoup:createRecvTransport`, `mediasoup:connectTransport`, `mediasoup:produce`, `mediasoup:consume`, `mediasoup:resumeConsumer`, `mediasoup:pauseConsumer`, `mediasoup:closeConsumer`, `mediasoup:closeProducer`

### REST API

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Health check (không auth) |
| GET | `/api/info` | Thông tin service |
| GET | `/api/rooms` | Danh sách phòng |
| GET | `/api/rooms/:roomId` | Chi tiết phòng (peers, producers) |
| DELETE | `/api/rooms/:roomId` | Admin đóng phòng |

## Chạy local

```bash
cd mediasoup-server
npm install
npm run dev          # dev mode (tsx watch)
```

Mở `http://localhost:4443/health` để kiểm tra. ⚠️ Lưu ý: **mediasoup chỉ build chạy trên Linux/macOS/WSL** — trên Windows phải dùng Docker hoặc WSL (xem bên dưới).

## Deploy lên server (Docker — khuyến nghị)

```bash
# 1. Copy project lên server (scp/git clone)
scp -r mediasoup-server user@your-server:~/mediasoup-server

# 2. Trên server:
cd mediasoup-server
cp .env.example .env
nano .env            # đặt ANNOUNCED_IP=<IP public của server>
docker compose up -d --build

# 3. Kiểm tra
curl http://localhost:4443/health
docker compose logs -f
```

### Firewall phải mở

| Port | Protocol | Bắt buộc? |
|---|---|---|
| `4443` (hoặc PORT) | TCP | Signaling + REST |
| `40000–40100` (RTC_MIN–RTC_MAX) | **UDP** (+TCP) | Media WebRTC |

### Các biến môi trường

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `4443` | Cổng HTTP |
| `ANNOUNCED_IP` | — | **Bắt buộc khi deploy** — IP public server |
| `RTC_MIN_PORT` / `RTC_MAX_PORT` | `40000`/`40100` | Dải port media (100 port ≈ ~25 peer video) |
| `MEDIASOUP_WORKERS` | min(4, cores) | Số worker |
| `LISTEN_IP` | `0.0.0.0` | IP bind socket |

## Kết nối từ app video-call

1. `cd client && npm install mediasoup-client socket.io-client`
2. Tạo service mới (ví dụ `src/services/sfu.ts`) theo flow ở mục API ở trên.
3. Trỏ socket tới `http://<sfu-server>:4443`, giữ nguyên socket signaling cũ của app (chat, quiz...) — chỉ phần media chuyển qua SFU.
4. Đặt `ANNOUNCED_IP` đúng IP public, mở dải port UDP trên firewall.

## Hiệu năng

- 1 worker ≈ đủ cho ~500 consumers (room 10 người ≈ 90 consumers).
- Room đông hơn → tăng `MEDIASOUP_WORKERS` (mỗi room nằm trên 1 worker).
- Simulcast: bật ở client khi `produce()` (`encodings` với nhiều layers) — server forward nguyên trạng, không cần cấu hình thêm.
