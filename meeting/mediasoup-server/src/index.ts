/**
 * mediasoup-server — entry point
 *
 * Khởi động:
 *   1. mediasoup workers (tiến trình C++ xử lý media)
 *   2. Express HTTP server (REST API)
 *   3. Socket.IO (signaling WebRTC)
 *
 * Chạy:  npm run dev   (dev, tsx watch)
 *        npm run build && npm start   (production)
 */
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import restRoutes from './rest.routes.js';
import { registerSignaling } from './socket.handler.js';
import { mediasoupService } from './mediasoup.service.js';
import { config } from './config.js';

async function main(): Promise<void> {
  console.log('🚀 Starting mediasoup-server...');

  // 1. Khởi tạo mediasoup workers TRƯỚC khi nhận kết nối
  await mediasoupService.init();

  // 2. Express + REST API
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
    || 'https://codeclass.vnotemate.com,http://localhost:5173,http://localhost:4443')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const corsOk = (origin?: string) => !origin || ALLOWED_ORIGINS.includes(origin);

  const app = express();
  app.use(cors({ origin: (origin, cb) => cb(null, corsOk(origin)) }));
  app.use(express.json());
  app.use(restRoutes);

  const server = http.createServer(app);

  // 3. Socket.IO signaling (Mediasoup/WebRTC cần WebSocket để real-time)
  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, cb) => cb(null, corsOk(origin)),
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e6,
  });
  registerSignaling(io);

  // Graceful shutdown: đóng mọi worker/room khi nhận SIGINT/SIGTERM
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal} — shutting down...`);
    server.close();
    io.close();
    await mediasoupService.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 4. Listen
  const { listenIp, listenPort } = config.http;
  server.listen(listenPort, listenIp, () => {
    console.log(`✅ mediasoup-server ready on http://${listenIp}:${listenPort}`);
    console.log(`   REST API:  http://localhost:${listenPort}/api/rooms`);
    console.log(`   Signaling: Socket.IO path /socket.io`);
    console.log(`   RTC ports: ${config.worker.rtcMinPort}-${config.worker.rtcMaxPort} (UDP/TCP)`);
    const announced = config.webRtcTransport.listenIps[0]?.announcedIp;
    console.log(`   Announced IP: ${announced || '(chưa đặt — chỉ chạy local được!)'}`);
  });
}

main().catch((err) => {
  console.error('❌ Fatal error during startup:', err);
  process.exit(1);
});
