import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { getStreakHistory, getStreakOverview, parseRescuedDays } from "../utils/xpLedger";

const router = Router();

const STAFF_ROLES = ["admin", "teacher", "teaching_assistant"];
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/**
 * GET /api/streak/history[?userId=&days=]
 * Lịch sử chuỗi theo từng ngày: học / được khiên che / được admin cứu / nghỉ.
 * Học sinh chỉ xem được của chính mình; giáo viên/admin xem được của bất kỳ ai.
 */
router.get("/streak/history", authenticate, async (req: Request, res: Response) => {
  try {
    const me = req.user!;
    const targetId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : me.userId;
    if (targetId !== me.userId && !STAFF_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Chỉ giáo viên/admin mới xem được lịch sử của học sinh khác" });
      return;
    }
    const days = Number(req.query.days) || 70;
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, fullName: true, avatarUrl: true, role: true },
    });
    if (!target) {
      res.status(404).json({ error: "Không tìm thấy người dùng" });
      return;
    }
    const history = await getStreakHistory(targetId, days);
    res.json({ user: target, ...history });
  } catch {
    res.status(500).json({ error: "Failed to load streak history" });
  }
});

/** GET /api/streak/overview — tóm tắt chuỗi của TOÀN BỘ học sinh (cho giáo viên). */
router.get("/streak/overview", authenticate, requireRole(...STAFF_ROLES), async (_req: Request, res: Response) => {
  try {
    res.json({ students: await getStreakOverview() });
  } catch {
    res.status(500).json({ error: "Failed to load streak overview" });
  }
});

/**
 * POST /api/streak/rescue { userId, date, note? }
 * Admin/teacher cứu một ngày nghỉ do lỗi (không tốn khiên của học sinh).
 */
router.post("/streak/rescue", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
    if (!userId || !DAY_KEY_RE.test(date)) {
      res.status(400).json({ error: "Cần userId và date (YYYY-MM-DD)" });
      return;
    }
    if (date > todayKey()) {
      res.status(400).json({ error: "Không thể cứu một ngày trong tương lai" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, streakRescuedDays: true },
    });
    if (!user) {
      res.status(404).json({ error: "Không tìm thấy học sinh" });
      return;
    }
    const rescued = parseRescuedDays(user.streakRescuedDays);
    if (rescued.includes(date)) {
      res.json({ ok: true, rescuedDays: rescued, already: true });
      return;
    }
    rescued.push(date);
    rescued.sort();
    await prisma.user.update({
      where: { id: userId },
      data: { streakRescuedDays: JSON.stringify(rescued) },
    });
    res.json({ ok: true, rescuedDays: rescued });
  } catch {
    res.status(500).json({ error: "Failed to rescue streak day" });
  }
});

/** DELETE /api/streak/rescue?userId=&date= — hoàn tác một ngày đã cứu. */
router.delete("/streak/rescue", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const date = typeof req.query.date === "string" ? req.query.date.trim() : "";
    if (!userId || !DAY_KEY_RE.test(date)) {
      res.status(400).json({ error: "Cần userId và date (YYYY-MM-DD)" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, streakRescuedDays: true },
    });
    if (!user) {
      res.status(404).json({ error: "Không tìm thấy học sinh" });
      return;
    }
    const rescued = parseRescuedDays(user.streakRescuedDays).filter((d) => d !== date);
    await prisma.user.update({
      where: { id: userId },
      data: { streakRescuedDays: JSON.stringify(rescued) },
    });
    res.json({ ok: true, rescuedDays: rescued });
  } catch {
    res.status(500).json({ error: "Failed to undo rescue" });
  }
});

export default router;
