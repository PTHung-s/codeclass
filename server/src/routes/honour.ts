import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { vnDayKey } from "../utils/vnTime";
import { onlineStudentIds } from "../services/gameWebSocket";
import { notifyNotificationChanged } from "../services/notificationEvents";
import {
  getPendingCards,
  getWeeklyTop3,
  markShown,
  type PendingCard,
} from "../services/honourService";

const router = Router();

const MAX_PRAISE_LENGTH = 300;
const MIN_PRAISE_LENGTH = 2;

/**
 * GET /api/honour/pending
 *
 * Cards to fly in for the caller right now: today's top-3 students who are
 * online and whom this viewer still owes a compliment. A refresh mid-animation
 * replays the card by design — the compliment is what retires it, not the
 * fly-in. Writing twice is impossible anyway: /honour/praise is idempotent on
 * (author, honouree, day), and a praised card stops being pending.
 *
 * NB: the response field is named `dayKey` (was `weekKey`) and stores a
 * `vnDayKey()` like "2026-08-07". The old weekly name lived in this slot
 * before the period switched to daily.
 */
router.get("/honour/pending", authenticate, async (req: Request, res: Response) => {
  try {
    const viewerId = req.user!.userId;
    const dayKey = vnDayKey();
    const cards = await getPendingCards(viewerId, onlineStudentIds());
    if (cards.length === 0) {
      res.json({ dayKey, cards: [] });
      return;
    }

    await markShown(viewerId, cards);

    res.json({
      dayKey,
      // Everything that survives getPendingCards() is either the viewer's own
      // card — nothing to write — or one they have not praised today. The
      // praise lookup lives there now, so there is nothing left to check here.
      cards: cards.map((c: PendingCard) => ({ ...c, praiseRequired: !c.selfCard })),
    });
  } catch (err) {
    console.error("honour pending error:", err);
    res.status(500).json({ error: "Không tải được thẻ vinh danh" });
  }
});

/** GET /api/honour/top3 — the weekly top 3 (same source as /leaderboard), shown to honour cards each day. */
router.get("/honour/top3", authenticate, async (_req: Request, res: Response) => {
  try {
    res.json({ dayKey: vnDayKey(), top3: await getWeeklyTop3() });
  } catch (err) {
    console.error("honour top3 error:", err);
    res.status(500).json({ error: "Không tải được bảng vinh danh" });
  }
});

/**
 * POST /api/honour/praise — write the compliment that unlocks the card.
 * Body: { honoureeId, message }
 */
router.post("/honour/praise", authenticate, async (req: Request, res: Response) => {
  try {
    const authorId = req.user!.userId;
    const honoureeId = typeof req.body?.honoureeId === "string" ? req.body.honoureeId : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!honoureeId) {
      res.status(400).json({ error: "Thiếu học sinh được vinh danh" });
      return;
    }
    if (message.length < MIN_PRAISE_LENGTH) {
      res.status(400).json({ error: "Hãy viết một lời khen ngắn gọn" });
      return;
    }
    if (message.length > MAX_PRAISE_LENGTH) {
      res.status(400).json({ error: `Lời khen tối đa ${MAX_PRAISE_LENGTH} ký tự` });
      return;
    }
    if (honoureeId === authorId) {
      res.status(400).json({ error: "Không cần tự khen mình" });
      return;
    }

    // Only the actual weekly top 3 can be praised, so the endpoint cannot be
    // used to write arbitrary messages into anyone's notification bell.
    const top3 = await getWeeklyTop3();
    const honouree = top3.find((h) => h.userId === honoureeId);
    if (!honouree) {
      res.status(400).json({ error: "Học sinh này không thuộc top 3 tuần này" });
      return;
    }

    const dayKey = vnDayKey();
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { fullName: true, nickname: true, role: true },
    });

    const existing = await prisma.honourPraise.findUnique({
      where: { authorId_honoureeId_weekKey: { authorId, honoureeId, weekKey: dayKey } },
      select: { id: true },
    });
    if (existing) {
      // Idempotent: the card is already unlocked for this viewer. Returning ok
      // means a double-click or a retry after a dropped response is harmless.
      res.json({ ok: true, alreadyPraised: true });
      return;
    }

    await prisma.honourPraise.create({
      data: { authorId, honoureeId, weekKey: dayKey, rank: honouree.rank, message },
    });

    // Delivered through the existing notification bell rather than a new inbox.
    await prisma.notification.create({
      data: {
        userId: honoureeId,
        title: `💜 ${(author?.role === "student" ? author.nickname?.trim() || author.fullName : author?.fullName) || "Một bạn"} khen bạn`,
        message,
        type: "honour_praise",
        relatedEntityType: "HonourPraise",
        relatedEntityId: dayKey,
      },
    });
    notifyNotificationChanged(honoureeId);

    res.json({ ok: true });
  } catch (err) {
    console.error("honour praise error:", err);
    res.status(500).json({ error: "Không gửi được lời khen" });
  }
});

/** GET /api/honour/my-praises — compliments the caller received, newest first. */
router.get("/honour/my-praises", authenticate, async (req: Request, res: Response) => {
  try {
    const praises = await prisma.honourPraise.findMany({
      where: { honoureeId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { author: { select: { id: true, fullName: true, nickname: true, avatarUrl: true, role: true } } },
    });
    res.json({
      praises: praises.map((p) => ({
        id: p.id,
        // Field name kept as weekKey for backwards compatibility with the DB
        // column, but its value is now `vnDayKey()` (daily period).
        dayKey: p.weekKey,
        rank: p.rank,
        message: p.message,
        createdAt: p.createdAt,
        author: { ...p.author, fullName: p.author.role === "student" ? p.author.nickname?.trim() || p.author.fullName : p.author.fullName },
      })),
    });
  } catch (err) {
    console.error("honour my-praises error:", err);
    res.status(500).json({ error: "Không tải được lời khen" });
  }
});

export default router;
