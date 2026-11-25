/**
 * Quiz Bank Pipeline — classifies + QC's draft bank items using the
 * quiz-classify-v2 prompt with self-consistency (2 independent LLM rounds),
 * then merges the two results and stores a consolidated tag/QC set.
 *
 * Flow per item:
 *   draft → (2 LLM rounds) → diff/merge → validate → ai_pending | rejected
 *
 * Only `approved` items (human-approved from ai_pending) may later be
 * distributed to courses / adaptive / arena / exams.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

export const PIPELINE_VERSION = "quiz-classify-v2";
const PROMPT_PATH = path.resolve(process.cwd(), "prompts", "quiz-classify-v2.txt");

const VALID_SKILLS = new Set(SKILL_SEEDS.map((s) => s.skillId));
const QUESTION_TYPES = new Set([
  "output_prediction", "code_tracing", "concept_recall", "fill_blank",
  "error_spotting", "best_practice", "api_usage", "math_evaluation",
]);
const COGNITIVE_LEVELS = new Set(["remember", "understand", "apply", "analyze"]);
const QC_ISSUES = new Set([
  "ambiguous", "two_correct", "no_correct", "option_leak",
  "all_of_the_above", "explanation_reveals_answer", "mixed_diacritics", "too_verbose",
]);

const SKILL_CATALOG = SKILL_SEEDS.map(
  (s) => `${s.skillId} — ${s.name}: ${s.description}`,
).join("\n");

// ── LLM output shape ──
interface ClassifyOutput {
  qc: {
    status: "pass" | "flag" | "reject";
    issues: string[];
    quality: { accuracy: number; clarity: number; engagement: number; style: number; presentation: number };
    notes: string;
    suggestion: string;
  };
  tags: {
    /** Phân phối xác suất: skillId → weight (0..1, tổng = 1). Argmax = testsSkill chính. */
    testsSkillWeights: Record<string, number>;
    secondarySkillIds: string[];
    requiresSkills: string[];
    questionType: string;
    cognitiveLevel: string;
    difficulty: { authored: number; reason: string };
  };
}

function loadPromptTemplate(): string {
  return fs.readFileSync(PROMPT_PATH, "utf8");
}

function buildPrompt(template: string, item: { stem: string; options: string; answerIndex: number; explanation: string }): string {
  const questionJson = JSON.stringify({
    stem: item.stem,
    options: JSON.parse(item.options || "[]"),
    answerIndex: item.answerIndex,
    explanation: item.explanation,
  });
  return template
    .replace(/\{\{SKILL_CATALOG\}\}/g, SKILL_CATALOG)
    .replace(/\{\{MACHINE_VERIFIED\}\}/g, "không khả thi với câu này (chưa chạy code thật)")
    .replace(/\{\{QUESTION_JSON\}\}/g, questionJson);
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/```(?:json)?\s*/g, "").trim();
  return t;
}

async function callOnce(prompt: string): Promise<ClassifyOutput | null> {
  const result = await chatCompletion(
    [{ role: "user", content: prompt }],
    { temperature: 0.5, max_tokens: 900, response_format: { type: "json_object" }, timeoutMs: 60000 },
  );
  if (!result) return null;
  try {
    const parsed = JSON.parse(stripFences(result.content));
    return parsed as ClassifyOutput;
  } catch {
    return null;
  }
}

const clampScore = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
};

/**
 * Validate & normalize the testsSkillWeights distribution:
 *  - drop keys not in the canonical catalog
 *  - drop negative or non-numeric weights
 *  - if LLM accidentally returned percentages (any value > 1), divide by 100
 *  - renormalize so they sum to 1.0 (tolerance ±0.02)
 *  - cap at 4 entries to avoid noise; sort desc by weight
 * Returns null if no valid keys survive.
 */
function normalizeWeights(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([sid, w]) => VALID_SKILLS.has(sid) && typeof w === "number" && Number.isFinite(w) && (w as number) > 0)
    .map(([sid, w]) => {
      let v = w as number;
      if (v > 1.5) v = v / 100; // LLM accidentally sent percentages
      return [sid, Math.max(0, Math.min(1, v))] as const;
    });
  if (entries.length === 0) return null;
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (sum <= 0) return null;
  // Renormalize so weights sum to exactly 1
  const norm: Record<string, number> = {};
  for (const [sid, w] of entries) norm[sid] = Math.round((w / sum) * 10000) / 10000;
  // Renormalize again after rounding (avoids drift like 0.9999)
  const sum2 = Object.values(norm).reduce((s, v) => s + v, 0);
  if (Math.abs(sum2 - 1) > 0.0001) {
    for (const k of Object.keys(norm)) norm[k] = Math.round((norm[k] / sum2) * 10000) / 10000;
  }
  // Cap to top 4 by weight, renormalize once more
  const top4 = Object.entries(norm).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum3 = top4.reduce((s, [, w]) => s + w, 0);
  const out: Record<string, number> = {};
  for (const [sid, w] of top4) out[sid] = Math.round((w / sum3) * 10000) / 10000;
  return out;
}

/**
 * Process a single LLM output into a stored bank item.
 *  - normalize the weights distribution
 *  - derive testsSkill = argmax (kept as String for FK compat with mastery)
 *  - validate other fields; flag needsReview when signals are weak
 */
function processSingle(out: ClassifyOutput): { ok: boolean; needsReview: boolean; finalStatus: "ai_pending" | "rejected"; data: {
  testsSkill: string | null; testsSkillWeights: Record<string, number>;
  secondarySkillIds: string[]; requiresSkills: string[]; questionType: string | null;
  cognitiveLevel: string | null; difficultyAuthored: number; difficultyReason: string;
  qcStatus: "pass" | "flag" | "reject"; qcIssues: string[];
  qualityScores: ClassifyOutput["qc"]["quality"]; qcNotes: string; qcSuggestion: string;
} } {
  let needsReview = false;

  // ── testsSkillWeights: normalize ──
  const weights = normalizeWeights(out.tags.testsSkillWeights);
  if (!weights) {
    // No valid skills → flag and reject downstream hard rule
    return { ok: false, needsReview: true, finalStatus: "ai_pending", data: emptyData() };
  }
  // Low confidence signals → flag for review
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const maxW = sorted[0][1];
  const secondW = sorted[1]?.[1] ?? 0;
  if (maxW < 0.5) needsReview = true;                          // chưa chắc chắn 1 skill nào
  if (maxW - secondW < 0.15) needsReview = true;               // đang phân vân giữa 2 skill
  const testsSkill = sorted[0][0];

  // ── requiresSkills: filter catalog; must contain testsSkill ──
  const requires = (out.tags.requiresSkills || []).filter((s) => VALID_SKILLS.has(s));
  if (!requires.includes(testsSkill)) requires.unshift(testsSkill);

  // ── secondarySkillIds: top weighted skills excluding testsSkill, capped at 2 ──
  const secondary = sorted.slice(1).map(([s]) => s).filter((s) => s !== testsSkill).slice(0, 2);

  // ── questionType / cognitiveLevel (fallback if invalid) ──
  let questionType = (out.tags.questionType || "").trim();
  if (!QUESTION_TYPES.has(questionType)) { questionType = "concept_recall"; needsReview = true; }
  let cognitiveLevel = (out.tags.cognitiveLevel || "").trim();
  if (!COGNITIVE_LEVELS.has(cognitiveLevel)) { cognitiveLevel = "understand"; needsReview = true; }

  // ── difficulty ──
  const difficultyAuthored = clampScore(out.tags.difficulty?.authored);
  const difficultyReason = String(out.tags.difficulty?.reason || "").slice(0, 100);

  // ── QC fields ──
  const qcStatus = out.qc.status;
  const qcIssues = (out.qc.issues || []).filter((i) => QC_ISSUES.has(i));
  const qualityScores = {
    accuracy: clampScore(out.qc.quality?.accuracy),
    clarity: clampScore(out.qc.quality?.clarity),
    engagement: clampScore(out.qc.quality?.engagement),
    style: clampScore(out.qc.quality?.style),
    presentation: clampScore(out.qc.quality?.presentation),
  };

  // Hard post-rules
  let finalStatus: "ai_pending" | "rejected" = "ai_pending";
  let finalQc: "pass" | "flag" | "reject" = qcStatus;
  if (qcStatus === "reject") finalStatus = "rejected";
  if (qualityScores.accuracy <= 2) { finalStatus = "rejected"; finalQc = "reject"; }
  if (["clarity", "style", "presentation"].some((k) => (qualityScores as any)[k] <= 2)) {
    if (finalQc === "pass") finalQc = "flag";
  }

  return {
    ok: true,
    needsReview,
    finalStatus,
    data: {
      testsSkill, testsSkillWeights: weights,
      secondarySkillIds: secondary, requiresSkills: requires,
      questionType, cognitiveLevel,
      difficultyAuthored, difficultyReason,
      qcStatus: finalQc, qcIssues,
      qualityScores, qcNotes: String(out.qc.notes || "").slice(0, 300),
      qcSuggestion: String(out.qc.suggestion || "").slice(0, 300),
    },
  };
}

function emptyData() {
  return {
    testsSkill: null, testsSkillWeights: {},
    secondarySkillIds: [], requiresSkills: [], questionType: null,
    cognitiveLevel: null, difficultyAuthored: 3, difficultyReason: "",
    qcStatus: "pass" as const, qcIssues: [],
    qualityScores: { accuracy: 3, clarity: 3, engagement: 3, style: 3, presentation: 3 },
    qcNotes: "", qcSuggestion: "",
  };
}

/** Weighted composite quality score (0–5). Weights sum to 10. */
function compositeQuality(q: ClassifyOutput["qc"]["quality"]): number {
  const weighted = q.accuracy * 3 + q.clarity * 2 + q.style * 2 + q.presentation * 2 + q.engagement * 1;
  return Math.round((weighted / 10) * 100) / 100;
}

function difficultyBand(d: number): "easy" | "medium" | "hard" {
  if (d <= 2) return "easy";
  if (d <= 3) return "medium";
  return "hard";
}

/** Classify a single bank item. Returns the new status. */
export async function classifyItem(itemId: string): Promise<string> {
  const item = await prisma.quizBankItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Không tìm thấy câu hỏi");
  if (item.status !== "draft") return item.status;

  const template = loadPromptTemplate();
  const prompt = buildPrompt(template, item);

  // 1 LLM round (model trả phân phối trọng số; argmax = testsSkill)
  const round = await callOnce(prompt);

  if (!round) {
    return "draft"; // retry next time
  }

  const proc = processSingle(round);
  const d = proc.data;

  await prisma.quizBankItem.update({
    where: { id: itemId },
    data: {
      status: proc.finalStatus,
      needsReview: proc.needsReview,
      testsSkill: d.testsSkill,
      testsSkillWeights: JSON.stringify(d.testsSkillWeights),
      secondarySkillIds: JSON.stringify(d.secondarySkillIds),
      requiresSkills: JSON.stringify(d.requiresSkills),
      questionType: d.questionType,
      cognitiveLevel: d.cognitiveLevel,
      difficultyAuthored: d.difficultyAuthored,
      difficultyBand: difficultyBand(d.difficultyAuthored),
      difficultyReason: d.difficultyReason,
      qcStatus: d.qcStatus,
      qcIssues: JSON.stringify(d.qcIssues),
      qualityScores: JSON.stringify(d.qualityScores),
      qualityScore: compositeQuality(d.qualityScores),
      qcNotes: d.qcNotes,
      qcSuggestion: d.qcSuggestion,
      pipelineVersion: PIPELINE_VERSION,
      aiReviewedAt: new Date(),
      rounds: JSON.stringify([round]),
    },
  });

  return proc.finalStatus;
}

/** Run the pipeline over up to `limit` draft items (optionally filtered by sourceFile prefix). */
export async function runPipeline(
  limit = 20,
  filter?: { sourceFilePrefix?: string },
): Promise<{ processed: number; pending: number; rejected: number; failed: number }> {
  if (!hasLLM()) throw new Error("Chưa cấu hình LLM (VILAO_API_KEY hoặc DEEPSEEK_API_KEY)");

  const drafts = await prisma.quizBankItem.findMany({
    where: {
      status: "draft",
      ...(filter?.sourceFilePrefix ? { sourceFile: { startsWith: filter.sourceFilePrefix } } : {}),
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let pending = 0, rejected = 0, failed = 0;
  for (const item of drafts) {
    try {
      const status = await classifyItem(item.id);
      if (status === "ai_pending") pending++;
      else if (status === "rejected") rejected++;
      else failed++; // still draft (LLM call failed — retryable)
    } catch (err) {
      console.error(`[QuizBank] classify failed for ${item.id}:`, err);
      failed++;
    }
  }

  console.log(`[QuizBank] Pipeline done: ${drafts.length} drafts → ${pending} pending, ${rejected} rejected, ${failed} failed`);
  return { processed: drafts.length, pending, rejected, failed };
}
