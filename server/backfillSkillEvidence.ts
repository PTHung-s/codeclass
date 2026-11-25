/**
 * Backfill skill_evidences từ dữ liệu lịch sử.
 *
 * Chạy 1 lần, idempotent (recordSkillEvidenceBatch dùng INSERT OR IGNORE).
 * Sau khi chạy xong:
 * - skill_evidences chứa tất cả answer rows cũ đã được approved-tag.
 * - recalculateMasteryForStudent chuyển sang đọc sink — kết quả mastery
 *   không đổi (vì evidence cũ đã được capture đầy đủ).
 *
 * Cú pháp:
 *   cd server && npx tsx backfillSkillEvidence.ts [path/to/dev.db]
 *
 * Nếu không truyền path, dùng DATABASE_URL hiện tại (file:./prisma/dev.db).
 */

import prisma from "./src/utils/prisma";
import { recordSkillEvidenceBatch } from "./src/services/skillEvidence";
import { computeItemEvidenceWeight } from "./src/services/skillMastery";

function parseAnswers(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** questionId → population option distribution (for replaying the same
 *  guess-discount weights the old in-recalc path applied). */
async function loadCalibDistributions(): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  const rows = await prisma.quizQuestionCalibration.findMany({
    select: { questionId: true, optionDistribution: true },
  });
  for (const row of rows) {
    try {
      const dist = JSON.parse(row.optionDistribution || "[]");
      if (Array.isArray(dist) && dist.length > 0) map.set(row.questionId, dist);
    } catch { /* keep absent */ }
  }
  return map;
}

async function backfillLessonQuiz(calib: Map<string, number[]>): Promise<number> {
  const attempts = await prisma.quizAttempt.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      quiz: {
        include: {
          questions: {
            select: { id: true, skillId: true, skillTagStatus: true, difficulty: true },
          },
        },
      },
    },
  });
  console.log(`[backfill] lesson_quiz attempts: ${attempts.length}`);
  const qMap = new Map<string, { id: string; skillId: string | null; skillTagStatus: string; difficulty: number }>();
  for (const a of attempts) {
    for (const q of a.quiz?.questions || []) {
      qMap.set(q.id, q);
    }
  }
  const rows: any[] = [];
  // Ordinal per (user, quiz) counts every attempt WITH answers (empty-answer
  // attempts are skipped before the increment — same rule as the pre-sink
  // replay) so retries keep the pT discount they had before.
  const quizOrdinal = new Map<string, number>();
  for (const att of attempts) {
    const answers = parseAnswers(att.answers);
    if (answers.length === 0) continue;
    const ordKey = `${att.userId}:${att.quizId}`;
    const attemptOrdinal = (quizOrdinal.get(ordKey) || 0) + 1;
    quizOrdinal.set(ordKey, attemptOrdinal);
    const sessionKey = `lesson_quiz:${att.quizId}:${att.id}`;
    for (const a of answers) {
      if (!a || !a.questionId) continue;
      const q = qMap.get(a.questionId);
      if (!q || q.skillTagStatus !== "approved" || !q.skillId) continue;
      const difficulty = Number.isFinite(a.difficulty)
        ? Number(a.difficulty)
        : Number.isFinite(q.difficulty)
          ? Number(q.difficulty)
          : 3;
      // Same guess-discount the old in-recalc path applied (calib distribution
      // + the student's pick). difficulty itself is re-resolved live at replay.
      const dist = calib.get(a.questionId);
      const weight = dist
        ? computeItemEvidenceWeight(dist, a.selectedIndex ?? 0, a.correctIndex ?? 0, Boolean(a.isCorrect))
        : 1;
      rows.push({
        userId: att.userId,
        skillId: q.skillId,
        source: "lesson_quiz",
        contextId: att.quizId,
        questionKey: a.questionId,
        sessionKey,
        isCorrect: Boolean(a.isCorrect),
        difficultyUsed: difficulty,
        weight,
        attempt: attemptOrdinal,
        occurredAt: att.createdAt,
      });
    }
  }
  console.log(`[backfill] lesson_quiz rows prepared: ${rows.length}`);
  if (rows.length === 0) return 0;
  const res = await recordSkillEvidenceBatch(rows);
  console.log(`[backfill] lesson_quiz rows inserted: ${res.inserted}`);
  return res.inserted;
}

async function backfillProblemSubmission(): Promise<number> {
  const subs = await prisma.problemSubmission.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      problem: {
        select: { id: true, skillId: true, skillTagStatus: true, difficulty: true },
      },
    },
  });
  console.log(`[backfill] problem_submissions: ${subs.length}`);
  const diffMap: Record<string, number> = { easy: 1, medium: 3, hard: 5 };
  // Group by (user, problem) để tính attempt ordinal.
  const ordinal = new Map<string, number>();
  const rows: any[] = [];
  for (const sub of subs) {
    const p = sub.problem;
    if (!p || p.skillTagStatus !== "approved" || !p.skillId) continue;
    const key = `${sub.studentId}:${sub.problemId}`;
    const ord = (ordinal.get(key) || 0) + 1;
    ordinal.set(key, ord);
    const difficultyUsed = typeof p.difficulty === "string" ? diffMap[p.difficulty] ?? 3 : 3;
    rows.push({
      userId: sub.studentId,
      skillId: p.skillId,
      source: "problem",
      contextId: sub.problemId,
      questionKey: `attempt:${ord}`,
      sessionKey: `problem:${sub.problemId}:${ord}`,
      isCorrect: Boolean(sub.passed),
      difficultyUsed,
      weight: 1,
      attempt: ord,
      occurredAt: sub.createdAt,
    });
  }
  console.log(`[backfill] problem rows prepared: ${rows.length}`);
  if (rows.length === 0) return 0;
  const res = await recordSkillEvidenceBatch(rows);
  console.log(`[backfill] problem rows inserted: ${res.inserted}`);
  return res.inserted;
}

async function backfillAdaptive(calib: Map<string, number[]>): Promise<number> {
  const tests = await prisma.adaptiveTestAttempt.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`[backfill] adaptive_test_attempts: ${tests.length}`);
  const rows: any[] = [];
  for (const t of tests) {
    const answers = parseAnswers(t.answers);
    const sessionKey = `adaptive_test:${t.id}`;
    for (const a of answers) {
      if (!a || !a.skillId) continue; // adaptive.ts:188 đã gate approved
      const difficultyUsed = Number.isFinite(a.baseDifficulty)
        ? Number(a.baseDifficulty)
        : Number.isFinite(a.difficulty)
          ? Number(a.difficulty)
          : 3;
      // The old replay read a.selectedAnswer/a.correctAnswer, which the stored
      // JSON never had (it stores selectedIndex/correctIndex) — i.e. it always
      // saw rate 0: weight 1 for correct, 0.9 for wrong on calibrated items.
      // Reproduce that exactly so the rebuild matches the stored mastery.
      let weight = 1;
      const dist = calib.get(a.questionId);
      if (dist) {
        const total = dist.reduce((s: number, n: number) => s + n, 0);
        if (total >= 6) weight = a.isCorrect ? 1 : 0.9;
      }
      rows.push({
        userId: t.userId,
        skillId: a.skillId,
        source: "adaptive_test",
        contextId: t.id,
        questionKey: a.questionId || `idx:${rows.length}`,
        sessionKey,
        isCorrect: Boolean(a.isCorrect),
        difficultyUsed,
        weight,
        occurredAt: t.createdAt,
      });
    }
  }
  console.log(`[backfill] adaptive rows prepared: ${rows.length}`);
  if (rows.length === 0) return 0;
  const res = await recordSkillEvidenceBatch(rows);
  console.log(`[backfill] adaptive rows inserted: ${res.inserted}`);
  return res.inserted;
}

async function main() {
  console.log("[backfill] start");
  const calib = await loadCalibDistributions();
  console.log(`[backfill] calibration distributions loaded: ${calib.size}`);
  const r1 = await backfillLessonQuiz(calib);
  const r2 = await backfillProblemSubmission();
  const r3 = await backfillAdaptive(calib);
  console.log(`[backfill] done. lesson_quiz=${r1}, problem=${r2}, adaptive=${r3}, total=${r1 + r2 + r3}`);
  await prisma.$disconnect();
}

main().then(() => {
  // prisma.ts keeps a metrics interval alive — exit explicitly once done.
  process.exit(0);
}).catch((e) => {
  console.error("[backfill] FATAL:", e);
  prisma.$disconnect();
  process.exit(1);
});