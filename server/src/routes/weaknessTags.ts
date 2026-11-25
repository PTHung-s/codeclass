import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { param } from "../utils/routeHelpers";
import prisma from "../utils/prisma";
import { analyzeWeaknesses, applyWeaknessAnalysis, runDailyWeaknessAnalysis } from "../services/weaknessAnalysis";

const router = Router();

// ── Get tags for a student (teacher/self) ──
router.get("/students/:userId/weakness-tags", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "userId");
    const tags = await prisma.studentWeaknessTag.findMany({
      where: { userId: studentId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load weakness tags" });
  }
});

// ── Run analysis for one student ──
router.post("/students/:userId/weakness-tags/analyze", authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "userId");
    const result = await analyzeWeaknesses(studentId);
    await applyWeaknessAnalysis(studentId, result);
    const tags = await prisma.studentWeaknessTag.findMany({
      where: { userId: studentId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    res.json({ ...result, tags });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// ── Get analysis status (teacher can see which AI is running for whom) ──
router.get("/admin/weakness-analysis/status", authenticate, requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const { getAnalysisStatus } = await import("../services/weaknessAnalysis");
    const status = await getAnalysisStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load status" });
  }
});

// ── Daily cron: analyze all active students ──
router.post("/admin/weakness-analysis/run-daily", authenticate, requireRole("admin", "teacher"), async (_req: Request, res: Response) => {
  try {
    const result = await runDailyWeaknessAnalysis();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Daily analysis failed" });
  }
});

// ── Manual tag management ──
router.post("/students/:userId/weakness-tags", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const studentId = param(req, "userId");
    const { tag, status, severity } = req.body;
    if (!tag || !tag.trim()) {
      res.status(400).json({ error: "Tag is required" });
      return;
    }
    const normalized = tag.trim().toLowerCase();
    await prisma.studentWeaknessTag.upsert({
      where: { userId_tag: { userId: studentId, tag: normalized } },
      create: { userId: studentId, tag: normalized, status: status || "active", severity: severity || 1, source: "manual" },
      update: { status: status || undefined, severity: severity || undefined },
    });
    const tags = await prisma.studentWeaknessTag.findMany({
      where: { userId: studentId },
      orderBy: [{ status: "asc" }, { severity: "desc" }],
    });
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update tag" });
  }
});

router.delete("/students/:userId/weakness-tags/:tagId", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    await prisma.studentWeaknessTag.delete({ where: { id: param(req, "tagId") } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete tag" });
  }
});

export default router;
