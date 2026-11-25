import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import {
  centrifugoEnabled,
  createCentrifugoSubscriptionToken,
  createCentrifugoToken,
  realtimeChannel,
} from "../services/centrifugo";
import { canAccessArena, canAccessCodeDuel, handleCentrifugoCommand } from "../services/gameWebSocket";

const router = Router();

/** Short-lived connection JWT. Its secret never enters the browser bundle. */
router.get("/token", authenticate, async (req: Request, res: Response) => {
  if (!centrifugoEnabled()) {
    res.status(503).json({ error: "Realtime service chưa được cấu hình" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, role: true, fullName: true, avatarUrl: true },
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const channels = [realtimeChannel.global, realtimeChannel.user(user.id)];
  if (["teacher", "admin", "teaching_assistant"].includes(user.role)) channels.push(realtimeChannel.staff);
  res.json({ token: createCentrifugoToken(user, channels), channels });
});

router.get("/subscription-token", authenticate, async (req: Request, res: Response) => {
  if (!centrifugoEnabled()) { res.status(503).json({ error: "Realtime service chưa được cấu hình" }); return; }
  const channel = typeof req.query.channel === "string" ? req.query.channel : "";
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, role: true } });
  if (!user || !channel || channel.length > 255) { res.status(400).json({ error: "Kênh không hợp lệ" }); return; }

  const authUser = { userId: user.id, role: user.role } as any;
  let allowed = false;
  if (channel.startsWith("arena:")) allowed = await canAccessArena(authUser, channel.slice("arena:".length));
  else if (channel.startsWith("arena_staff:")) allowed = ["teacher", "admin", "teaching_assistant"].includes(user.role)
    && await canAccessArena(authUser, channel.slice("arena_staff:".length));
  else if (channel.startsWith("duel:")) allowed = await canAccessCodeDuel(authUser, channel.slice("duel:".length));
  else if (channel.startsWith("duel_staff:")) allowed = ["teacher", "admin", "teaching_assistant"].includes(user.role)
    && await canAccessCodeDuel(authUser, channel.slice("duel_staff:".length));
  else if (channel.startsWith("match:")) {
    const matchId = channel.slice("match:".length);
    allowed = ["teacher", "admin", "teaching_assistant"].includes(user.role)
      || Boolean(await prisma.game_players.findUnique({ where: { match_id_user_id: { match_id: matchId, user_id: user.id } }, select: { user_id: true } }));
  } else if (channel.startsWith("exam_staff:")) {
    const examId = channel.slice("exam_staff:".length);
    allowed = ["teacher", "admin", "teaching_assistant"].includes(user.role)
      && Boolean(await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } }));
  }
  if (!allowed) { res.status(403).json({ error: "Không có quyền vào phòng này" }); return; }
  res.json({ token: createCentrifugoSubscriptionToken(user.id, channel) });
});

/** Called only by Centrifugo over loopback with a private static header. */
router.post("/rpc", async (req: Request, res: Response) => {
  const proxySecret = process.env.CENTRIFUGO_RPC_PROXY_SECRET;
  if (!proxySecret || req.get("X-Centrifugo-Proxy-Secret") !== proxySecret) {
    res.status(401).json({ error: { code: 1000, message: "Unauthorized proxy" } });
    return;
  }
  const body = req.body as { user?: string; method?: string; data?: unknown };
  if (body.method !== "realtime" || !body.user || !body.data || typeof body.data !== "object") {
    res.status(400).json({ error: { code: 1000, message: "Invalid realtime command" } });
    return;
  }
  const command = body.data as { type?: unknown; payload?: unknown };
  if (typeof command.type !== "string" || command.type.length > 80) {
    res.status(400).json({ error: { code: 1000, message: "Invalid realtime command" } });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: body.user }, select: { id: true, role: true } });
  if (!user) { res.status(403).json({ error: { code: 1000, message: "User not found" } }); return; }
  try {
    await handleCentrifugoCommand({ userId: user.id, role: user.role } as any, { type: command.type, payload: command.payload });
    res.json({ result: { data: { accepted: true } } });
  } catch (error) {
    console.error("[centrifugo] rpc failed:", error);
    res.status(500).json({ error: { code: 1000, message: "Realtime command failed" } });
  }
});

export default router;
