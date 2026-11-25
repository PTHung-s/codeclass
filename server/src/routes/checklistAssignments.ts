import { Router, Request, Response } from "express";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

const router = Router();
router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const assignments = await prisma.checklistAssignment.findMany({
      where: role === "student" ? { students: { some: { studentId: userId } } } : {},
      include: { items: { orderBy: { orderIndex: "asc" }, include: { completions: { select: { studentId: true } } } }, students: { include: { student: { select: { id: true, fullName: true, nickname: true } } } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
    const ids = assignments.flatMap(a => a.items.map(i => i.id));
    const completions = role === "student" ? await prisma.checklistItemCompletion.findMany({ where: { itemId: { in: ids }, studentId: userId }, select: { itemId: true } }) : [];
    const done = new Set(completions.map(c => c.itemId));
    res.json(assignments.map(a => ({ ...a, items: a.items.map(i => ({ ...i, completed: done.has(i.id) })) })));
  } catch { res.status(500).json({ error: "Failed to load checklist assignments" }); }
});

router.post("/", requireRole("admin", "teacher", "teaching_assistant"), async (req: Request, res: Response) => {
  try {
    const title = String(req.body.title || "").trim();
    const items = Array.isArray(req.body.items) ? req.body.items.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
    const studentIds: string[] = Array.isArray(req.body.studentIds) ? Array.from(new Set((req.body.studentIds as unknown[]).map(String))) : [];
    if (!title || !items.length || !studentIds.length) return res.status(400).json({ error: "Cần tiêu đề, checklist và học sinh" });
    const students = await prisma.user.count({ where: { id: { in: studentIds }, role: "student", status: "active" } });
    if (students !== studentIds.length) return res.status(400).json({ error: "Danh sách học sinh không hợp lệ" });
    const assignment = await prisma.checklistAssignment.create({ data: { title, description: req.body.description?.trim() || null, createdById: req.user!.userId, items: { create: items.map((text: string, orderIndex: number) => ({ text, orderIndex })) }, students: { create: studentIds.map((studentId: string) => ({ studentId })) } }, include: { items: true, students: { include: { student: { select: { id: true, fullName: true, nickname: true } } } } } });
    res.status(201).json(assignment);
  } catch { res.status(500).json({ error: "Failed to create checklist assignment" }); }
});

router.patch("/:itemId/toggle", requireRole("student"), async (req: Request, res: Response) => {
  try {
    const itemId = String(req.params.itemId);
    const studentId = req.user!.userId;
    const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { assignmentId: true } });
    if (!item) return res.status(404).json({ error: "Item not found" });
    const assigned = await prisma.checklistAssignmentStudent.findUnique({ where: { assignmentId_studentId: { assignmentId: item.assignmentId, studentId } } });
    if (!assigned) return res.status(403).json({ error: "Not assigned" });
    const existing = await prisma.checklistItemCompletion.findUnique({ where: { itemId_studentId: { itemId, studentId } } });
    if (existing) await prisma.checklistItemCompletion.delete({ where: { id: existing.id } });
    else await prisma.checklistItemCompletion.create({ data: { itemId, studentId } });
    res.json({ completed: !existing });
  } catch { res.status(500).json({ error: "Failed to toggle checklist item" }); }
});

export default router;
