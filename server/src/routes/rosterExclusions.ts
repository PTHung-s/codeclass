import { Router, Request, Response } from "express";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();
router.use(authenticate, requireRole("admin", "teacher", "teaching_assistant"));

router.get("/", async (_req: Request, res: Response) => {
  try {
    const exclusions = await prisma.studentRosterExclusion.findMany({
      include: {
        student: { select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true } },
        removedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(exclusions);
  } catch (error) {
    console.error("roster exclusions list error:", error);
    res.status(500).json({ error: "Failed to load roster exclusions" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const studentId = typeof req.body?.studentId === "string" ? req.body.studentId : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : null;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true } });
    if (!student || student.role !== "student") return res.status(404).json({ error: "Student not found" });

    const exclusion = await prisma.studentRosterExclusion.upsert({
      where: { studentId },
      create: { studentId, removedById: req.user!.userId, reason },
      update: { removedById: req.user!.userId, reason, createdAt: new Date() },
      include: { student: { select: { id: true, fullName: true, nickname: true, email: true, avatarUrl: true } } },
    });
    res.json(exclusion);
  } catch (error) {
    console.error("roster exclusion create error:", error);
    res.status(500).json({ error: "Failed to exclude student" });
  }
});

router.delete("/:studentId", async (req: Request, res: Response) => {
  try {
    await prisma.studentRosterExclusion.delete({ where: { studentId: String(req.params.studentId) } });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Exclusion not found" });
    console.error("roster exclusion restore error:", error);
    res.status(500).json({ error: "Failed to restore student" });
  }
});

export default router;
