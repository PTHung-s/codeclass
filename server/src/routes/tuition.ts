import { Router, Request, Response } from "express";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();

// ─── GET /tuition/sheet?year=YYYY ───
// Public endpoint: Get tuition payment sheet for a year
router.get("/sheet", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Get all students
    const students = await prisma.user.findMany({
      where: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
      select: { id: true, fullName: true, nickname: true, email: true },
      orderBy: { fullName: "asc" },
    });

    // Get all tuition payments for this year
    const periods = Array.from({ length: 12 }, (_, i) => {
      const month = (i + 1).toString().padStart(2, "0");
      return `${year}-${month}`;
    });

    const payments = await prisma.globalTuitionPayment.findMany({
      where: { period: { in: periods } },
      select: { userId: true, period: true, status: true, amount: true, note: true },
    });

    // Build map: userId -> period -> {status, amount, note}
    const paymentMap: Record<string, Record<string, { status: string; amount: number | null; note: string | null }>> = {};
    payments.forEach((p) => {
      if (!paymentMap[p.userId]) paymentMap[p.userId] = {};
      paymentMap[p.userId][p.period] = { status: p.status, amount: p.amount, note: p.note || null };
    });

    // Build rows
    const rows = students.map((s) => ({
      studentId: s.id,
      studentName: s.fullName,
      nickname: s.nickname,
      months: periods.map((p) => paymentMap[s.id]?.[p] || { status: "unpaid", amount: null, note: null }),
    }));

    res.json({ year, rows });
  } catch (error) {
    console.error("Error fetching tuition sheet:", error);
    res.status(500).json({ error: "Lỗi khi tải bảng học phí" });
  }
});

// Read-only public sheet for parents; no notes, email addresses, statistics, or write access.
router.get("/public-sheet", async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const periods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const students = await prisma.user.findMany({ where: { role: "student", status: "active", studentRosterExclusions: { none: {} } }, select: { id: true, fullName: true, nickname: true }, orderBy: { fullName: "asc" } });
    const payments = await prisma.globalTuitionPayment.findMany({ where: { period: { in: periods }, userId: { in: students.map(s => s.id) } }, select: { userId: true, period: true, status: true, amount: true } });
    const map = new Map(payments.map(p => [`${p.userId}:${p.period}`, { status: p.status, amount: p.amount }]));
    res.json({ year, rows: students.map(s => ({ studentId: s.id, studentName: s.nickname?.trim() || s.fullName, months: periods.map(p => map.get(`${s.id}:${p}`) || { status: "unpaid", amount: null }) })) });
  } catch (err) { console.error("public tuition error:", err); res.status(500).json({ error: "Failed to load public tuition" }); }
});

// ─── GET /tuition/detail?userId=xxx&period=YYYY-MM ───
// Teacher-only: Get detailed tuition info for a specific cell
router.get("/detail", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { userId, period } = req.query;
    if (!userId || !period) {
      return res.status(400).json({ error: "Missing userId or period" });
    }

    const payment = await prisma.globalTuitionPayment.findUnique({
      where: { userId_period: { userId: userId as string, period: period as string } },
      include: { user: { select: { fullName: true, nickname: true, email: true } } },
    });

    if (!payment) {
      return res.json({ status: "unpaid", amount: null, note: null, paidAt: null });
    }

    res.json(payment);
  } catch (error) {
    console.error("Error fetching tuition detail:", error);
    res.status(500).json({ error: "Lỗi khi tải chi tiết học phí" });
  }
});

// ─── PUT /tuition/update ───
// Teacher-only: Update tuition payment (create or update)
router.put("/update", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const { userId, period, status, amount, note } = req.body;
    if (!userId || !period) {
      return res.status(400).json({ error: "Missing userId or period" });
    }

    const paidAt = status === "paid" ? new Date() : null;

    const payment = await prisma.globalTuitionPayment.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, status, amount, note, paidAt },
      update: { status, amount, note, paidAt, updatedAt: new Date() },
    });

    res.json(payment);
  } catch (error) {
    console.error("Error updating tuition:", error);
    res.status(500).json({ error: "Lỗi khi cập nhật học phí" });
  }
});

// ─── GET /tuition/stats?year=YYYY ───
// Teacher-only: Get tuition statistics for a year
router.get("/stats", authenticate, requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const periods = Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, "0")}`);

    const activeRosterStudents = await prisma.user.findMany({
      where: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
      select: { id: true },
    });
    const payments = await prisma.globalTuitionPayment.findMany({
      where: { period: { in: periods }, userId: { in: activeRosterStudents.map((student) => student.id) } },
      select: { status: true, amount: true },
    });

    const totalPaid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPartial = payments.filter((p) => p.status === "partial").reduce((sum, p) => sum + (p.amount || 0), 0);
    const countPaid = payments.filter((p) => p.status === "paid").length;
    const countPartial = payments.filter((p) => p.status === "partial").length;
    const countUnpaid = activeRosterStudents.length * 12 - countPaid - countPartial;

    res.json({ year, totalPaid, totalPartial, countPaid, countPartial, countUnpaid });
  } catch (error) {
    console.error("Error fetching tuition stats:", error);
    res.status(500).json({ error: "Lỗi khi tải thống kê học phí" });
  }
});

export default router;
