import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { param } from "../utils/routeHelpers";
import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";
import { runPipeline, PIPELINE_VERSION } from "../services/quizBankPipeline";

const router = Router();
router.use(authenticate);
router.use(requireRole("teacher", "admin", "teaching_assistant"));

const VALID_SKILLS = new Set(SKILL_SEEDS.map((s) => s.skillId));

/** Stable fingerprint for dedupe: hash of normalized stem + options. */
function fingerprint(stem: string, options: string[]): string {
  const norm = stem.trim().toLowerCase().replace(/\s+/g, " ");
  const opts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
  return crypto.createHash("sha256").update(`${norm}::${opts}`).digest("hex").slice(0, 32);
}

// ── GET /quiz-bank/stats — counts by status + skill coverage ──
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [draft, aiPending, approved, rejected, needsReview] = await Promise.all([
      prisma.quizBankItem.count({ where: { status: "draft" } }),
      prisma.quizBankItem.count({ where: { status: "ai_pending" } }),
      prisma.quizBankItem.count({ where: { status: "approved" } }),
      prisma.quizBankItem.count({ where: { status: "rejected" } }),
      prisma.quizBankItem.count({ where: { needsReview: true, status: "ai_pending" } }),
    ]);
    res.json({ draft, aiPending, approved, rejected, needsReview, pipelineVersion: PIPELINE_VERSION });
  } catch (err) {
    console.error("quiz-bank stats error:", err);
    res.status(500).json({ error: "Không tải được thống kê quiz bank." });
  }
});

// ── GET /quiz-bank/items?status=&skill=&needsReview=&limit= ──
router.get("/items", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const skill = typeof req.query.skill === "string" ? req.query.skill : undefined;
    const needsReview = req.query.needsReview === "1" ? true : undefined;
    const qcParam = typeof req.query.qc === "string" ? req.query.qc : "";
    const qc = ["pass", "flag", "reject"].includes(qcParam) ? qcParam : undefined;
    const hasIssues = req.query.hasIssues === "1" ? true : undefined;
    const limit = Math.min(100, Number(req.query.limit) || 30);

    const items = await prisma.quizBankItem.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(skill ? { testsSkill: skill } : {}),
        ...(needsReview !== undefined ? { needsReview } : {}),
        ...(qc ? { qcStatus: qc } : {}),
        ...(hasIssues !== undefined ? { qcIssues: { not: "[]" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(items.map((it) => ({
      ...it,
      options: JSON.parse(it.options || "[]"),
      testsSkillWeights: JSON.parse(it.testsSkillWeights || "{}"),
      secondarySkillIds: JSON.parse(it.secondarySkillIds || "[]"),
      requiresSkills: JSON.parse(it.requiresSkills || "[]"),
      suitableFor: JSON.parse(it.suitableFor || "[]"),
      qcIssues: JSON.parse(it.qcIssues || "[]"),
      qualityScores: JSON.parse(it.qualityScores || "{}"),
      misconceptions: JSON.parse(it.misconceptions || "{}"),
    })));
  } catch (err) {
    console.error("quiz-bank list error:", err);
    res.status(500).json({ error: "Không tải được danh sách quiz bank." });
  }
});

// ── POST /quiz-bank/import — bulk import questions as drafts (dedupe by fingerprint) ──
// body: { questions: [{ stem, options[4], answerIndex, explanation?, source?, sourceFile? }] }
router.post("/import", async (req: Request, res: Response) => {
  try {
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (questions.length === 0) {
      res.status(400).json({ error: "Thiếu danh sách questions." });
      return;
    }

    let imported = 0, skipped = 0, invalid = 0;
    for (const q of questions) {
      const stem = typeof q.stem === "string" ? q.stem.trim() : "";
      const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [];
      const answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : -1;
      if (!stem || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) {
        invalid++;
        continue;
      }
      const fp = fingerprint(stem, options);
      const existing = await prisma.quizBankItem.findUnique({ where: { fingerprint: fp } });
      if (existing) { skipped++; continue; }

      await prisma.quizBankItem.create({
        data: {
          stem,
          options: JSON.stringify(options),
          answerIndex,
          explanation: typeof q.explanation === "string" ? q.explanation : "",
          source: typeof q.source === "string" ? q.source : "import",
          sourceFile: typeof q.sourceFile === "string" ? q.sourceFile : null,
          fingerprint: fp,
          status: "draft",
        },
      });
      imported++;
    }

    res.json({ imported, skipped, invalid });
  } catch (err) {
    console.error("quiz-bank import error:", err);
    res.status(500).json({ error: "Không import được quiz bank." });
  }
});

// ── POST /quiz-bank/run-pipeline — classify drafts (fire-and-forget background) ──
// body: { limit?, sourceFilePrefix? }  — prefix lọc theo khóa (vd "C++", "Python", "Tư Duy Thuật Toán")
router.post("/run-pipeline", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(5000, Number(req.body?.limit) || 50);
    const sourceFilePrefix = typeof req.body?.sourceFilePrefix === "string" && req.body.sourceFilePrefix.trim()
      ? req.body.sourceFilePrefix.trim()
      : undefined;
    res.json({
      ok: true,
      message: `Đang chạy pipeline phân loại (tối đa ${limit} câu${sourceFilePrefix ? `, lọc "${sourceFilePrefix}"` : ""}). Làm mới sau 1-2 phút.`,
    });
    runPipeline(limit, sourceFilePrefix ? { sourceFilePrefix } : undefined)
      .catch((err) => console.error("[QuizBank] pipeline error:", err));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Không chạy được pipeline." });
  }
});

// ── POST /quiz-bank/bulk-reject — reject mọi ai_pending đang khớp bộ lọc ──
// body: { skill?, sourceFilePrefix? } — cùng ngữ nghĩa bộ lọc như GET /items
router.post("/bulk-reject", async (req: Request, res: Response) => {
  try {
    const skill = typeof req.body?.skill === "string" && req.body.skill.trim() ? req.body.skill.trim() : undefined;
    const sourceFilePrefix = typeof req.body?.sourceFilePrefix === "string" && req.body.sourceFilePrefix.trim()
      ? req.body.sourceFilePrefix.trim()
      : undefined;
    const count = await prisma.quizBankItem.updateMany({
      where: {
        status: "ai_pending",
        ...(skill ? { testsSkill: skill } : {}),
        ...(sourceFilePrefix ? { sourceFile: { startsWith: sourceFilePrefix } } : {}),
      },
      data: { status: "rejected", reviewedAt: new Date() },
    });
    res.json({ ok: true, rejected: count.count });
  } catch (err) {
    console.error("quiz-bank bulk-reject error:", err);
    res.status(500).json({ error: "Không bỏ qua hàng loạt được." });
  }
});

// ── POST /quiz-bank/items/:id/approve — approve (optionally override testsSkill) ──
router.post("/items/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const overrideSkill = typeof req.body?.testsSkill === "string" ? req.body.testsSkill.trim() : null;
    const item = await prisma.quizBankItem.findUnique({ where: { id } });
    if (!item) { res.status(404).json({ error: "Không tìm thấy câu hỏi." }); return; }

    const finalSkill = overrideSkill && VALID_SKILLS.has(overrideSkill) ? overrideSkill : item.testsSkill;
    if (!finalSkill || !VALID_SKILLS.has(finalSkill)) {
      res.status(400).json({ error: "Cần testsSkill hợp lệ để duyệt." });
      return;
    }

    await prisma.quizBankItem.update({
      where: { id },
      data: {
        status: "approved",
        testsSkill: finalSkill,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("quiz-bank approve error:", err);
    res.status(500).json({ error: "Không duyệt được câu hỏi." });
  }
});

// ── POST /quiz-bank/items/:id/reject ──
router.post("/items/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    await prisma.quizBankItem.update({
      where: { id },
      data: { status: "rejected", reviewedBy: req.user!.userId, reviewedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("quiz-bank reject error:", err);
    res.status(500).json({ error: "Không từ chối được câu hỏi." });
  }
});

// ── POST /quiz-bank/bulk-approve — approve all ai_pending with a valid testsSkill ──
router.post("/bulk-approve", async (req: Request, res: Response) => {
  try {
    const validIds = SKILL_SEEDS.map((s) => `'${s.skillId.replace(/'/g, "''")}'`).join(", ");
    const count = await prisma.$executeRawUnsafe(
      `UPDATE quiz_bank_items
       SET status = 'approved', reviewed_at = datetime('now')
       WHERE status = 'ai_pending' AND tests_skill IS NOT NULL AND tests_skill IN (${validIds})`,
    );
    res.json({ ok: true, approved: count });
  } catch (err) {
    console.error("quiz-bank bulk-approve error:", err);
    res.status(500).json({ error: "Không duyệt hàng loạt được." });
  }
});

export default router;
