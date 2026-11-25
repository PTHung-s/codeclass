import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { param } from "../utils/routeHelpers";
import {
  getSkillStates,
  getActiveRecommendations,
  recalculateMasteryForStudent,
  recalculateMasteryForAllStudents,
  dismissRecommendation,
  estimateMasteryUncertainty,
  applyMemoryDecay,
  countSpacedSuccesses,
  REVIEW_RETENTION_THRESHOLD,
  type MasteryHistoryEntry,
} from "../services/skillMastery";
import { SKILL_SEEDS, TOPICS } from "../utils/skillGraph";
import {
  completeDailyStudyItem,
  createTodayDailyStudyPlan,
  getTodayDailyStudyPlan,
} from "../services/dailyStudyPlan";
import { calibrateAllSkills, getAllCalibrations } from "../services/bktCalibrator";

const router = Router();
router.use(authenticate);

const isStaff = (role: string) =>
  ["teacher", "admin", "teaching_assistant"].includes(role);

const canViewStudent = (viewer: { userId: string; role: string }, targetUserId: string) =>
  viewer.userId === targetUserId || isStaff(viewer.role);

// ── GET /api/skills — All skills grouped by topic ──
router.get("/", async (_req: Request, res: Response) => {
  const skills = await prisma.skill.findMany({ orderBy: { orderIndex: "asc" } });
  const groups = TOPICS.map((topic) => ({
    topicId: topic.topicId,
    topicName: topic.topicName,
    sequenceNo: topic.sequenceNo,
    skills: topic.skillIds
      .map((sid) => skills.find((s) => s.skillId === sid))
      .filter(Boolean)
      .map((s) => ({
        skillId: s!.skillId,
        name: s!.name,
        description: s!.description,
        orderIndex: s!.orderIndex,
      })),
  }));
  res.json(groups);
});

// ── Daily review plan — only uses completed lessons + approved skill evidence ──
router.get("/daily-plan/today", async (req: Request, res: Response) => {
  try {
    const plan = await getTodayDailyStudyPlan(req.user!.userId);
    res.json(plan);
  } catch (err) {
    console.error("get daily study plan error:", err);
    res.status(500).json({ error: "Không thể tải kế hoạch ôn tập hôm nay." });
  }
});

router.post("/daily-plan/today", async (req: Request, res: Response) => {
  try {
    const plan = await createTodayDailyStudyPlan(req.user!.userId);
    res.status(201).json(plan);
  } catch (err) {
    console.error("create daily study plan error:", err);
    res.status(500).json({ error: "Không thể tạo kế hoạch ôn tập hôm nay." });
  }
});

router.post("/daily-plan/items/:id/complete", async (req: Request, res: Response) => {
  try {
    const plan = await completeDailyStudyItem(req.user!.userId, param(req, "id"));
    res.json(plan);
  } catch (err: any) {
    if (err?.message !== "Không tìm thấy mục ôn tập.") {
      console.error("complete daily study item error:", err);
    }
    res.status(404).json({ error: err.message || "Không thể hoàn thành mục ôn tập." });
  }
});

// ── GET /api/skills/:userId — Mastery for each skill of a student ──
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const targetUserId = param(req, "userId");
    if (!canViewStudent(req.user!, targetUserId)) {
      res.status(403).json({ error: "Bạn không có quyền xem dữ liệu này." });
      return;
    }
    const states = await getSkillStates(targetUserId);
    res.json(states);
  } catch (err: any) {
    console.error("get skill states error:", err);
    res.status(500).json({ error: "Không thể tải dữ liệu kỹ năng." });
  }
});

// ── GET /api/skills/:userId/recommendations — Active recommendations ──
router.get("/:userId/recommendations", async (req: Request, res: Response) => {
  try {
    const targetUserId = param(req, "userId");
    if (!canViewStudent(req.user!, targetUserId)) {
      res.status(403).json({ error: "Bạn không có quyền xem dữ liệu này." });
      return;
    }
    const recs = await getActiveRecommendations(targetUserId);
    res.json(recs);
  } catch (err: any) {
    console.error("get recommendations error:", err);
    res.status(500).json({ error: "Không thể tải đề xuất." });
  }
});

// ── POST /api/skills/:userId/recalculate — Force recalculate (staff only) ──
router.post("/:userId/recalculate", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ giáo viên mới có quyền này." });
      return;
    }
    const states = await recalculateMasteryForStudent(param(req, "userId"));
    res.json({ ok: true, skills: states });
  } catch (err: any) {
    console.error("recalculate mastery error:", err);
    res.status(500).json({ error: "Không thể tính lại mastery." });
  }
});

// ── POST /api/skills/recommendations/:id/dismiss — Dismiss a recommendation ──
router.post("/recommendations/:id/dismiss", async (req: Request, res: Response) => {
  try {
    await dismissRecommendation(param(req, "id"), req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("dismiss recommendation error:", err);
    res.status(400).json({ error: err.message || "Không thể ẩn đề xuất." });
  }
});

// ── POST /api/skills/recommendations/:id/complete — Mark recommendation complete ──
router.post("/recommendations/:id/complete", async (req: Request, res: Response) => {
  try {
    const rec = await prisma.recommendation.findUnique({ where: { id: param(req, "id") } });
    if (!rec || rec.userId !== req.user!.userId) {
      res.status(404).json({ error: "Không tìm thấy đề xuất." });
      return;
    }
    await prisma.recommendation.update({
      where: { id: param(req, "id") },
      data: { status: "completed", completedAt: new Date() },
    });
    await prisma.recommendationLog.create({
      data: {
        userId: req.user!.userId,
        recommendationId: param(req, "id"),
        ruleId: rec.ruleId,
        skillId: rec.skillId,
        reason: rec.reason,
        evidence: rec.evidence,
        confidence: rec.confidence,
        action: "completed",
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("complete recommendation error:", err);
    res.status(400).json({ error: "Không thể đánh dấu hoàn thành." });
  }
});

// ── GET /api/skills/heatmap/all — Teacher heatmap (staff only) ──
router.get("/heatmap/all", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ giáo viên mới có quyền này." });
      return;
    }
    // Get all students with their mastery
    const masteries = await prisma.studentSkillMastery.findMany({
      include: { user: { select: { id: true, fullName: true, nickname: true, avatarUrl: true } } },
    });

    // Group by user
    const userMap = new Map<string, {
      userId: string;
      fullName: string;
      nickname: string | null;
      avatarUrl: string | null;
      skills: Record<string, {
        mastery: number;
        rawMastery: number;
        retentionRate: number;
        dueForReview: boolean;
        daysSinceLastPractice: number;
        lowerBound: number;
        upperBound: number;
        confidenceLevel: "low" | "forming" | "medium" | "high";
        evidenceCount: number;
      }>;
    }>();

    const nowMs = Date.now();
    for (const m of masteries) {
      if (!userMap.has(m.userId)) {
        userMap.set(m.userId, {
          userId: m.userId,
          fullName: m.user.fullName,
          nickname: m.user.nickname,
          avatarUrl: m.user.avatarUrl,
          skills: {},
        });
      }
      let history: MasteryHistoryEntry[] = [];
      try { history = JSON.parse(m.historyJson || "[]"); } catch { history = []; }
      if (history.length === 0) continue;

      const lastEntry = history[history.length - 1];
      const lastMs = Date.parse(lastEntry.ts);
      const daysSinceLastPractice = Number.isFinite(lastMs)
        ? Math.max(0, Math.round(((nowMs - lastMs) / 86_400_000) * 10) / 10)
        : 0;
      const spacedCount = countSpacedSuccesses(history);
      const decayed = applyMemoryDecay(m.value, daysSinceLastPractice, spacedCount);
      const band = estimateMasteryUncertainty(decayed.effectiveMastery, history);
      if (!band) continue;
      userMap.get(m.userId)!.skills[m.skillId] = {
        mastery: decayed.effectiveMastery,
        rawMastery: Math.round(m.value * 1e4) / 1e4,
        retentionRate: decayed.retentionRate,
        dueForReview: decayed.retentionRate < REVIEW_RETENTION_THRESHOLD && m.value >= 0.5,
        daysSinceLastPractice,
        evidenceCount: history.length,
        ...band,
      };
    }

    // Get all skills
    const skills = SKILL_SEEDS.map((s) => ({
      skillId: s.skillId,
      name: s.name,
      topicName: s.topicName,
    }));

    // Unknown skills are excluded: absence of evidence is not weak mastery.
    const stuckClusters: Array<{ skillId: string; skillName: string; count: number; userIds: string[] }> = [];
    for (const skill of SKILL_SEEDS) {
      const stuckUsers = Array.from(userMap.values())
        .filter((u) => u.skills[skill.skillId]?.mastery < 0.5)
        .map((u) => u.userId);
      if (stuckUsers.length >= 2) {
        stuckClusters.push({
          skillId: skill.skillId,
          skillName: skill.name,
          count: stuckUsers.length,
          userIds: stuckUsers,
        });
      }
    }

    res.json({
      students: Array.from(userMap.values()),
      skills,
      stuckClusters,
    });
  } catch (err: any) {
    console.error("heatmap error:", err);
    res.status(500).json({ error: "Không thể tải heatmap." });
  }
});

// ── Admin: GET /api/skills/admin/engine — Get engine config ──
router.get("/admin/engine", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ admin mới có quyền này." });
      return;
    }
    const row = await prisma.engineSetting.findUnique({ where: { key: "mastery_engine" } });
    const bktRow = await prisma.engineSetting.findUnique({ where: { key: "bkt_params" } });
    res.json({
      activeEngine: row?.value === "ewma" ? "ewma" : "bkt",
      bktParams: bktRow ? JSON.parse(bktRow.value) : null,
    });
  } catch (err: any) {
    console.error("get engine config error:", err);
    res.status(500).json({ error: "Không thể tải cấu hình engine." });
  }
});

// ── Admin: POST /api/skills/admin/engine — Set engine config ──
router.post("/admin/engine", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ admin mới có quyền này." });
      return;
    }
    const { engine } = req.body;
    if (!["ewma", "bkt"].includes(engine)) {
      res.status(400).json({ error: "Engine phải là 'ewma' hoặc 'bkt'." });
      return;
    }
    await prisma.engineSetting.upsert({
      where: { key: "mastery_engine" },
      create: { key: "mastery_engine", value: engine },
      update: { value: engine },
    });
    const summary = await recalculateMasteryForAllStudents();
    res.json({ ok: true, activeEngine: engine, recalculatedStudents: summary.updated, totalStudents: summary.totalStudents });
  } catch (err: any) {
    console.error("set engine config error:", err);
    res.status(500).json({ error: "Không thể cập nhật cấu hình engine." });
  }
});

// ── Admin: GET /api/skills/admin/rec-logs — Recommendation log ──
router.get("/admin/rec-logs", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ admin mới có quyền này." });
      return;
    }
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const logs = await prisma.recommendationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(logs);
  } catch (err: any) {
    console.error("rec logs error:", err);
    res.status(500).json({ error: "Không thể tải log." });
  }
});

// ── Admin: POST /api/skills/admin/calibrate — Run BKT calibration ──
router.post("/admin/calibrate", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ admin mới có quyền này." });
      return;
    }
    const results = await calibrateAllSkills({
      maxIterations: Number(req.body?.maxIterations) || 100,
      minSequences: Number(req.body?.minSequences) || 2,
    });
    const engineRow = await prisma.engineSetting.findUnique({ where: { key: "mastery_engine" } });
    const activeEngine = engineRow?.value === "ewma" ? "ewma" : "bkt";
    const summary = activeEngine === "bkt"
      ? await recalculateMasteryForAllStudents()
      : { totalStudents: 0, updated: 0, failed: 0 };
    res.json({ ok: true, skills: results, recalculatedStudents: summary.updated, totalStudents: summary.totalStudents });
  } catch (err: any) {
    console.error("calibrate error:", err);
    res.status(500).json({ error: err.message || "Không thể chạy calibrate." });
  }
});

// ── Admin: POST /api/skills/admin/recalculate-all — Rebuild mastery for all students ──
router.post("/admin/recalculate-all", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ giáo viên mới có quyền này." });
      return;
    }
    const summary = await recalculateMasteryForAllStudents();
    res.json({ ok: true, ...summary });
  } catch (err: any) {
    console.error("recalculate-all error:", err);
    res.status(500).json({ error: "Không thể tính lại mastery toàn lớp." });
  }
});

// ── Admin: GET /api/skills/admin/calibrate — Get all calibrations ──
router.get("/admin/calibrate", async (req: Request, res: Response) => {
  try {
    if (!isStaff(req.user!.role)) {
      res.status(403).json({ error: "Chỉ admin mới có quyền này." });
      return;
    }
    const calibrations = await getAllCalibrations();
    res.json({ calibrations, total: calibrations.length });
  } catch (err: any) {
    console.error("get calibrations error:", err);
    res.status(500).json({ error: "Không thể tải calibrations." });
  }
});

export default router;
