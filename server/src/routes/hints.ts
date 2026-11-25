import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, query } from "../utils/routeHelpers";

const router = Router();

// Get hints for a problem
// Students pay 1 hintCredit per new hint revealed (tracked via HintReveal).
// Teachers/admins get all hints for free.
router.get("/problems/:problemId/hints", authenticate, async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const index = query(req, "index");
    const { userId, role } = req.user!;
    const isStaff = ["admin", "teacher", "teaching_assistant"].includes(role);

    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    if (index !== undefined) {
      // Specific hint by index
      const hint = await prisma.hint.findFirst({
        where: { problemId, orderIndex: parseInt(index) },
      });
      if (!hint) {
        res.json([]);
        return;
      }

      if (isStaff) {
        res.json([hint]);
        return;
      }

      // Student: check if already revealed
      const revealed = await prisma.hintReveal.findUnique({
        where: { userId_hintId: { userId, hintId: hint.id } },
      });
      if (revealed) {
        res.json([hint]);
        return;
      }

      // Not revealed: try to spend 1 hintCredit
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { hintCredits: true } });
      if (!user || user.hintCredits <= 0) {
        res.status(402).json({ error: "Không đủ hint credits. Hãy đổi thêm gợi ý từ cửa hàng!", credits: user?.hintCredits ?? 0 });
        return;
      }

      await prisma.user.update({ where: { id: userId }, data: { hintCredits: { decrement: 1 } } });
      await prisma.hintReveal.create({ data: { userId, problemId, hintId: hint.id } });
      res.json([hint]);
      return;
    }

    // No index: return all hints for staff, or only revealed hints for students
    if (isStaff) {
      const hints = await prisma.hint.findMany({
        where: { problemId },
        orderBy: { orderIndex: "asc" },
      });
      res.json(hints);
    } else {
      const reveals = await prisma.hintReveal.findMany({
        where: { userId, problemId },
        select: { hintId: true },
      });
      const revealedIds = new Set(reveals.map((r) => r.hintId));
      const hints = await prisma.hint.findMany({
        where: { problemId },
        orderBy: { orderIndex: "asc" },
      });
      res.json(hints.filter((h) => revealedIds.has(h.id)));
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch hints" });
  }
});

// Create/update hints (batch)
router.put("/problems/:problemId/hints", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const problemId = param(req, "problemId");
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    if (req.user!.role !== "admin" && problem.createdById !== req.user!.userId) {
      res.status(403).json({ error: "Only the creator can manage hints" });
      return;
    }

    const { hints } = req.body; // [{ content: string }]

    await prisma.hint.deleteMany({ where: { problemId } });

    if (hints && Array.isArray(hints) && hints.length > 0) {
      await prisma.hint.createMany({
        data: hints.map((h: { content: string }, i: number) => ({
          problemId,
          orderIndex: i,
          content: h.content,
        })),
      });
    }

    const updated = await prisma.hint.findMany({
      where: { problemId },
      orderBy: { orderIndex: "asc" },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update hints" });
  }
});

export default router;
