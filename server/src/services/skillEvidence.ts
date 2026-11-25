/**
 * SkillEvidence — unified sink for student skill assessment.
 *
 * Mọi hành động của học sinh (lesson quiz, adaptive test, problem submission,
 * session quiz, arena quiz, in-lesson challenge, code duel) được ghi lại ở đây
 * NGAY TẠI THỜI ĐIỂM trả lời, với dedup unique theo
 * (userId, source, contextId, questionKey, sessionKey).
 *
 * Quy tắc:
 * - Idempotent qua skipDuplicates.
 * - Chỉ ghi khi skillId !== null && status === "approved".
 * - Caller bọc try/catch — evidence recorder lỗi không được phép chặn response.
 * - Không bao giờ emit evidence với skillId catch-all / unknown — nếu chưa tag,
 *   bỏ qua (trả mảng rỗng) để tránh polluting mastery.
 */

import prisma from "../utils/prisma";
import { randomUUID } from "node:crypto";

export type SkillEvidenceSource =
  | "lesson_quiz"
  | "adaptive_test"
  | "problem"
  | "session_quiz"
  | "arena_quiz"
  | "challenge"
  | "code_duel"
  | "exam";

export interface SkillEvidenceInput {
  userId: string;
  skillId: string | null;        // null → bị skip
  source: SkillEvidenceSource;
  contextId: string;              // quizId, problemId, lessonId, arenaQuestionId, roundId, challengeKey
  questionKey: string;            // questionId, index, challengeKey, "stage_6"
  sessionKey: string;             // gom theo phiên — vd: "quiz:<quizId>:<attemptId>"
  isCorrect: boolean;
  difficultyUsed?: number;
  weight?: number;
  attempt?: number;               // retry ordinal lúc ghi (mặc định 1)
  occurredAt: Date;
}

/** Lọc ra những row có skillId hợp lệ (gate "approved" do caller đảm nhiệm). */
function sanitize(rows: SkillEvidenceInput[]): SkillEvidenceInput[] {
  return rows.filter((r) => r && r.userId && r.skillId && r.contextId && r.questionKey && r.sessionKey);
}

/**
 * Ghi một batch evidence, bỏ qua các dòng trùng dedup key.
 * SQLite không có `skipDuplicates` trong Prisma createMany nên dùng
 * `INSERT OR IGNORE` raw (chuẩn SQLite). Chia batch để dưới
 * SQLITE_MAX_VARIABLE_NUMBER (999).
 * Trả về số row thực sự insert. Fail-soft: lỗi không lan ra caller.
 */
const SQLITE_MAX_COLS_PER_ROW = 10; // 12 cột × 80 rows = 960 tham số < 999 (SQLITE_MAX_VARIABLE_NUMBER)
const BATCH_SIZE = 80;

export async function recordSkillEvidenceBatch(rows: SkillEvidenceInput[]): Promise<{ inserted: number }> {
  const sanitized = sanitize(rows);
  if (sanitized.length === 0) return { inserted: 0 };
  let inserted = 0;
  try {
    for (let i = 0; i < sanitized.length; i += BATCH_SIZE) {
      const chunk = sanitized.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      for (const r of chunk) {
        const difficultyUsed = Number.isFinite(r.difficultyUsed) ? Number(r.difficultyUsed) : 3;
        const weight = Number.isFinite(r.weight) ? Number(r.weight) : 1;
        const attempt = Number.isFinite(r.attempt) ? Math.max(1, Math.round(Number(r.attempt))) : 1;
        placeholders.push("(?,?,?,?,?,?,?,?,?,?,?,?)");
        values.push(
          randomUUID(),
          r.userId,
          r.skillId!,
          r.source,
          r.contextId,
          r.questionKey,
          r.sessionKey,
          r.isCorrect ? 1 : 0,
          difficultyUsed,
          weight,
          attempt,
          r.occurredAt,
        );
      }
      const sql = `INSERT OR IGNORE INTO skill_evidences
        (id, userId, skillId, source, contextId, questionKey, sessionKey, isCorrect, difficultyUsed, weight, attempt, occurredAt)
        VALUES ${placeholders.join(",")}`;
      const res = await prisma.$executeRawUnsafe(sql, ...values);
      inserted += res;
    }
    return { inserted };
  } catch (err) {
    // Fail-soft: route gốc đã trả response rồi, đây là fire-and-forget.
    console.error("[skillEvidence] batch insert failed:", err);
    return { inserted: 0 };
  }
}

// ── Per-source builders ──
// Mỗi builder trả mảng SkillEvidenceInput[] đã gate skillTagStatus === "approved".
// Caller chỉ cần await recordSkillEvidenceBatch(...).

/**
 * Từ mảng details đã build sẵn trong quizzes.ts (chứa q.skillId + q.skillTagStatus
 * đã resolve tại thời điểm attempt).
 */
export function fromLessonQuizAttempt(
  userId: string,
  quizId: string,
  attemptId: string,
  details: Array<{
    questionId: string;
    isCorrect: boolean;
    skillId?: string | null;
    skillTagStatus?: string;
    difficulty?: number;
    contentVersion?: number;
    weight?: number;
  }>,
  occurredAt: Date,
  attemptOrdinal: number,
): SkillEvidenceInput[] {
  const sessionKey = `lesson_quiz:${quizId}:${attemptId}`;
  const rows: SkillEvidenceInput[] = [];
  for (const d of details) {
    if (!d.skillId || d.skillTagStatus !== "approved") continue;
    rows.push({
      userId,
      skillId: d.skillId,
      source: "lesson_quiz",
      contextId: quizId,
      questionKey: d.questionId,
      sessionKey,
      isCorrect: Boolean(d.isCorrect),
      difficultyUsed: Number.isFinite(d.difficulty) ? Number(d.difficulty) : 3,
      weight: Number.isFinite(d.weight) ? Number(d.weight) : 1,
      attempt: Math.max(1, attemptOrdinal),
      occurredAt,
    });
  }
  return rows;
}

/**
 * Từ answers của adaptive_test_attempts. skillId đã được gate approved ở
 * adaptive.ts:188 (chỉ set khi question.skillTagStatus === "approved").
 */
export function fromAdaptiveAttempt(
  userId: string,
  attemptId: string,
  answers: Array<{
    questionId: string;
    isCorrect: boolean;
    skillId?: string | null;
    difficulty?: number;
    baseDifficulty?: number;
  }>,
  occurredAt: Date,
): SkillEvidenceInput[] {
  const sessionKey = `adaptive_test:${attemptId}`;
  const rows: SkillEvidenceInput[] = [];
  for (const a of answers) {
    if (!a.skillId) continue; // gate đã làm upstream; chỉ check null
    rows.push({
      userId,
      skillId: a.skillId,
      source: "adaptive_test",
      contextId: attemptId,
      questionKey: a.questionId,
      sessionKey,
      isCorrect: Boolean(a.isCorrect),
      difficultyUsed: Number.isFinite(a.baseDifficulty)
        ? Number(a.baseDifficulty)
        : Number.isFinite(a.difficulty)
          ? Number(a.difficulty)
          : 3,
      weight: 1,
      occurredAt,
    });
  }
  return rows;
}

/**
 * Từ một problem submission. problem.skillId + problem.skillTagStatus đã
 * load tại write time.
 */
export function fromProblemSubmission(
  userId: string,
  problemId: string,
  attemptOrdinal: number,
  problem: { skillId?: string | null; skillTagStatus?: string; difficulty?: string | number },
  passed: boolean,
  occurredAt: Date,
): SkillEvidenceInput[] {
  if (!problem.skillId || problem.skillTagStatus !== "approved") return [];
  const diffMap: Record<string, number> = { easy: 1, medium: 3, hard: 5 };
  const difficultyUsed =
    typeof problem.difficulty === "string"
      ? diffMap[problem.difficulty] ?? 3
      : Number.isFinite(problem.difficulty)
        ? Number(problem.difficulty)
        : 3;
  return [
    {
      userId,
      skillId: problem.skillId,
      source: "problem",
      contextId: problemId,
      questionKey: `attempt:${attemptOrdinal}`,
      sessionKey: `problem:${problemId}:${attemptOrdinal}`,
      isCorrect: Boolean(passed),
      difficultyUsed,
      weight: 1,
      attempt: Math.max(1, attemptOrdinal),
      occurredAt,
    },
  ];
}

/**
 * Từ session course quiz attempt. Mỗi câu trong JSON có thể mang skillId
 * (đã gắn qua manual tag §6.1) — nếu thiếu thì skip.
 */
export function fromSessionQuizAttempt(
  userId: string,
  lessonId: string,
  attemptId: string,
  questions: Array<{ index: number; isCorrect: boolean; skillId?: string | null }>,
  occurredAt: Date,
): SkillEvidenceInput[] {
  const sessionKey = `session_quiz:${lessonId}:${attemptId}`;
  const rows: SkillEvidenceInput[] = [];
  for (const q of questions) {
    if (!q.skillId) continue;
    rows.push({
      userId,
      skillId: q.skillId,
      source: "session_quiz",
      contextId: lessonId,
      questionKey: `q:${q.index}`,
      sessionKey,
      isCorrect: Boolean(q.isCorrect),
      difficultyUsed: 3,
      weight: 1,
      occurredAt,
    });
  }
  return rows;
}

/**
 * Từ một bài thi (ExamAttempt). Chỉ ghi những skillId tồn tại trong bảng Skill.
 */
export function fromExamAttempt(
  userId: string,
  examId: string,
  attemptId: string,
  answers: Array<{ questionId: string; isCorrect: boolean; skillIds: string[]; difficulty?: number }>,
  validSkillIds: Set<string>,
  occurredAt: Date,
): SkillEvidenceInput[] {
  const sessionKey = `exam:${examId}:${attemptId}`;
  const rows: SkillEvidenceInput[] = [];
  for (const ans of answers) {
    const seen = new Set<string>();
    for (const skillId of ans.skillIds) {
      if (!skillId || seen.has(skillId) || !validSkillIds.has(skillId)) continue;
      seen.add(skillId);
      rows.push({
        userId,
        skillId,
        source: "exam",
        contextId: examId,
        questionKey: `${ans.questionId}:${skillId}`,
        sessionKey,
        isCorrect: Boolean(ans.isCorrect),
        difficultyUsed: Number.isFinite(ans.difficulty) ? Number(ans.difficulty) : 3,
        weight: 1,
        occurredAt,
      });
    }
  }
  return rows;
}

/**
 * Từ arena quiz answer (DebugArenaQuestion với quizItemId). skillId lấy từ
 * ArenaQuizItem.skillId đã load trong submitQuizAnswer.
 */
export function fromArenaQuizAnswer(
  userId: string,
  arenaQuestionId: string,
  matchId: string,
  quizItem: { skillId?: string | null; skillTagStatus?: string; effectiveDifficulty?: number | null; difficulty?: number | null },
  isCorrect: boolean,
  occurredAt: Date,
): SkillEvidenceInput[] {
  if (!quizItem.skillId || quizItem.skillTagStatus !== "approved") return [];
  return [
    {
      userId,
      skillId: quizItem.skillId,
      source: "arena_quiz",
      contextId: arenaQuestionId,
      questionKey: arenaQuestionId,
      sessionKey: `arena_quiz:${matchId}:${arenaQuestionId}`,
      isCorrect,
      difficultyUsed: Number.isFinite(quizItem.effectiveDifficulty)
        ? Number(quizItem.effectiveDifficulty)
        : Number.isFinite(quizItem.difficulty)
          ? Number(quizItem.difficulty)
          : 3,
      weight: 1,
      occurredAt,
    },
  ];
}

/**
 * Từ in-lesson challenge. SkillId lấy từ SkillTagMapping (challenge scope).
 * Ghi nhận tối đa 1 lần fail (:fail, weight 0.65) và 1 lần pass để tránh thiên lệch dương.
 */
export function fromChallengeAttempt(
  userId: string,
  challengeKey: string,
  lessonId: string,
  skillId: string | null,
  passed: boolean,
  occurredAt: Date,
): SkillEvidenceInput[] {
  if (!skillId) return [];
  return [
    {
      userId,
      skillId,
      source: "challenge",
      contextId: challengeKey,
      questionKey: passed ? challengeKey : `${challengeKey}:fail`,
      sessionKey: passed ? `challenge:${challengeKey}` : `challenge:${challengeKey}:fail`,
      isCorrect: Boolean(passed),
      difficultyUsed: 3,
      weight: passed ? 1 : 0.65,
      occurredAt,
    },
  ];
}

/**
 * Từ code duel submission (AC hoặc Fail sau khi chấm vòng). skillId từ CodeDuelRound.skillId.
 */
export function fromCodeDuelSubmission(
  userId: string,
  roundId: string,
  matchId: string,
  skillId: string | null,
  difficulty: string,
  occurredAt: Date,
  isCorrect: boolean = true,
): SkillEvidenceInput[] {
  if (!skillId) return [];
  const diffMap: Record<string, number> = { easy: 1, medium: 3, hard: 5 };
  return [
    {
      userId,
      skillId,
      source: "code_duel",
      contextId: roundId,
      questionKey: isCorrect ? roundId : `${roundId}:fail`,
      sessionKey: `code_duel:${matchId}:${roundId}:${isCorrect ? "ac" : "fail"}`,
      isCorrect: Boolean(isCorrect),
      difficultyUsed: diffMap[difficulty] ?? 3,
      weight: isCorrect ? 1 : 0.75,
      occurredAt,
    },
  ];
}

/**
 * Lấy skillId cho challenge từ SkillTagMapping (read-only helper, dùng tại write time).
 * Trả null nếu chưa có teacher tag → caller skip.
 */
export async function resolveChallengeSkill(challengeKey: string): Promise<string | null> {
  const m = await prisma.skillTagMapping.findUnique({
    where: { scope_refKey: { scope: "challenge", refKey: challengeKey } },
    select: { skillId: true, status: true },
  });
  return m && m.status === "approved" ? m.skillId : null;
}

/**
 * Lấy skillId cho session quiz question (lessonId:questionIndex → skillId).
 */
export async function resolveSessionQuizQuestionSkill(
  lessonId: string,
  questionIndex: number,
): Promise<string | null> {
  const refKey = `${lessonId}:${questionIndex}`;
  const m = await prisma.skillTagMapping.findUnique({
    where: { scope_refKey: { scope: "session_quiz_question", refKey } },
    select: { skillId: true, status: true },
  });
  return m && m.status === "approved" ? m.skillId : null;
}

/**
 * Lấy skillId cho code duel round: ưu tiên cột round.skillId (tag trong
 * authoring), fallback về SkillTagMapping scope "code_duel_round".
 */
export async function resolveCodeDuelRoundSkill(
  roundId: string,
  roundSkillId: string | null | undefined,
): Promise<string | null> {
  if (roundSkillId) return roundSkillId;
  const m = await prisma.skillTagMapping.findUnique({
    where: { scope_refKey: { scope: "code_duel_round", refKey: roundId } },
    select: { skillId: true, status: true },
  });
  return m && m.status === "approved" ? m.skillId : null;
}