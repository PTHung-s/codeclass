/**
 * REST API — quản lý phòng & health check.
 *
 * Signaling realtime (WebRTC) nằm ở socket.handler.ts, còn REST dùng cho:
 *   - Health check / monitoring (docker healthcheck, nginx)
 *   - Quản trị phòng: liệt kê, xóa
 */
import { Router, Request, Response } from 'express';
import { mediasoupService } from './mediasoup.service.js';
import * as mediasoup from 'mediasoup';

const router = Router();

/**
 * Auth cho các route quản trị /api/*. Client thường KHÔNG gọi /api (chỉ /health),
 * nên bật SFU_ADMIN_TOKEN là chặn được kẻ lạ xóa/liệt kê phòng.
 * Chưa đặt token → mở (chỉ nên ở dev).
 */
const ADMIN_TOKEN = process.env.SFU_ADMIN_TOKEN || '';
const requireAdmin = (req: Request, res: Response, next: () => void) => {
  if (!ADMIN_TOKEN) return next();
  const auth = req.headers.authorization || '';
  const ok = auth === `Bearer ${ADMIN_TOKEN}` || req.query.token === ADMIN_TOKEN;
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
router.use('/api', requireAdmin);

// Trang test đơn giản (dùng cho load test từ trình duyệt — origin http an toàn cho WS)
router.get('/', (_req: Request, res: Response) => {
  res.type('html').send('<!doctype html><html><head><title>SFU test</title></head><body><h1>mediasoup-server test page</h1><script>window.__pageLoaded = true;</script></body></html>');
});

/** GET /health — kiểm tra service còn sống (không cần auth) */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/** GET /api/info — thông tin service (phiên bản, số worker) */
router.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    service: 'mediasoup-server',
    mediasoupVersion: mediasoup.version,
    workers: Number(process.env.MEDIASOUP_WORKERS || 0) || undefined,
    rooms: mediasoupService.listRooms().length,
  });
});

/** GET /api/rooms — danh sách phòng đang hoạt động */
router.get('/api/rooms', (_req: Request, res: Response) => {
  res.json({ rooms: mediasoupService.listRooms() });
});

/** DELETE /api/rooms/:roomId — admin buộc đóng phòng (kick toàn bộ peer) */
router.delete('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const room = mediasoupService.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: `Room "${roomId}" not found` });
  }
  // Đóng router → mọi transport/producer/consumer của phòng này đóng theo
  room.router.close();
  res.json({ ok: true, roomId });
});

/**
 * POST /api/routing — app-server đặt nhóm âm thanh hoặc luật bất đối xứng cho 1 phòng.
 * body:
 *   - { roomId, audioMode: 'all' }                          → full mesh (mặc định cả lớp)
 *   - { roomId, hostId, hearHost: string[], hostFocus? }    → luật bất đối xứng ("Nghe host" / nói riêng / nhóm)
 *   - { roomId, group: string[] | null }                    → tương thích ngược
 */
router.post('/api/routing', (req: Request, res: Response) => {
  const { roomId, group, hostId, hearHost, audioMode, hostFocus } = req.body || {};
  if (!roomId || typeof roomId !== 'string') return res.status(400).json({ error: 'roomId required' });
  const room = mediasoupService.getRoom(roomId);
  if (!room) return res.status(404).json({ error: `Room "${roomId}" not found` });
  if (audioMode === 'all') {
    mediasoupService.setRouting(roomId, null);
    return res.json({ ok: true, mode: 'all' });
  }
  if (typeof hostId === 'string' && hostId && Array.isArray(hearHost)) {
    const allowed = hearHost.map(String);
    mediasoupService.setAsymmetricRouting(roomId, hostId, allowed, !!hostFocus);
    return res.json({ ok: true, mode: 'asymmetric', hostId, hearHost: allowed, hostFocus: !!hostFocus });
  }
  const g = Array.isArray(group) ? group.map(String) : null;
  mediasoupService.setRouting(roomId, g);
  res.json({ ok: true, active: g });
});

/** POST /api/exam-policy — app-server đồng bộ chính sách riêng tư màn hình thi cử */
router.post('/api/exam-policy', (req: Request, res: Response) => {
  const { roomId, monitoring, hostId, pinnedScreenId } = req.body || {};
  if (!roomId || typeof roomId !== 'string') return res.status(400).json({ error: 'roomId required' });
  const room = mediasoupService.getRoom(roomId);
  if (!room) return res.status(404).json({ error: `Room "${roomId}" not found` });
  mediasoupService.setExamPolicy(roomId, {
    monitoring: !!monitoring,
    hostId: typeof hostId === 'string' && hostId ? hostId : null,
    pinnedScreenId: typeof pinnedScreenId === 'string' && pinnedScreenId ? pinnedScreenId : null,
  });
  res.json({ ok: true, roomId, monitoring: !!monitoring });
});

/** GET /api/rooms/:roomId — chi tiết 1 phòng (số peer, producer) */
router.get('/api/rooms/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const room = mediasoupService.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: `Room "${roomId}" not found` });
  }
  res.json({
    id: room.id,
    createdAt: room.createdAt,
    peers: Array.from(room.peers.values()).map((p) => ({
      id: p.id,
      producers: Array.from(p.producers.keys()),
      consumers: Array.from(p.consumers.keys()),
      hasSendTransport: Boolean(p.sendTransport),
      hasRecvTransport: Boolean(p.recvTransport),
    })),
    rtpCapabilities: room.router.rtpCapabilities,
  });
});

export default router;
