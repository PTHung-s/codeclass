import { Router } from "express";
import prisma from "../utils/prisma";
import { countDbError } from "../utils/metrics";
import { vnDayKey, vnStartOfDay } from "../utils/vnTime";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// POST /api/tracking/heartbeat — receives active time + tab-out count
router.post("/heartbeat", async (req, res) => {
  try {
    const { activeSeconds, tabOuts } = req.body;
    const { userId } = req.user!;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // VN date key (Asia/Ho_Chi_Minh midnight)
    const vnDateKey = vnDayKey();

    const dateObj = new Date(`${vnDateKey}T00:00:00.000+07:00`);

    await prisma.sessionLog.upsert({
      where: { userId_date: { userId, date: dateObj } },
      create: {
        userId,
        date: dateObj,
        activeSeconds: Math.max(0, Math.round(activeSeconds || 0)),
        tabOuts: Math.max(0, Math.round(tabOuts || 0)),
      },
      update: {
        activeSeconds: { increment: Math.max(0, Math.round(activeSeconds || 0)) },
        tabOuts: { increment: Math.max(0, Math.round(tabOuts || 0)) },
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    countDbError("timeout");
    console.error("tracking heartbeat error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tracking/stats?userId=...&days=30
router.get("/stats", async (req, res) => {
  try {
    const targetUserId = req.query.userId as string;
    const isStaff = ["admin", "teacher", "teaching_assistant"].includes(req.user!.role);
    if (!targetUserId || (!isStaff && targetUserId !== req.user!.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));

    // Window starts at VN midnight `days` ago; sessionLog.date is keyed on VN
    // midnight (see the heartbeat handler above), so both sides must agree.
    const startDate = new Date(vnStartOfDay().getTime() - days * 86400000);

    const logs = await prisma.sessionLog.findMany({
      where: { userId: targetUserId, date: { gte: startDate } },
      orderBy: { date: "asc" },
    });

    // Aggregate
    const totalActiveSeconds = logs.reduce((sum: number, l) => sum + l.activeSeconds, 0);
    const totalTabOuts = logs.reduce((sum: number, l) => sum + l.tabOuts, 0);
    const dailyHours = logs.map((l) => ({
      // SessionLog stores the instant of VN midnight (17:00 UTC the day
      // before). Serialising it with toISOString would shift every bar back a
      // day and make valid study time look missing.
      date: vnDayKey(l.date),
      minutes: Math.round(l.activeSeconds / 60),
      tabOuts: l.tabOuts,
    }));

    return res.json({
      totalActiveSeconds,
      totalActiveHours: +(totalActiveSeconds / 3600).toFixed(1),
      totalTabOuts,
      daysTracked: logs.length,
      daily: dailyHours,
    });
  } catch (err: any) {
    console.error("tracking stats error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
