import prisma from "./prisma";
import { getRates } from "./gamificationSettings";
import { notifyWalletChanged } from "./realtimeEvents";

// ── Default token earning rates (admin can override via settings) ──
// Tokens are a spendable currency, so rates are intentionally smaller/more deliberate than XP.
export const PROBLEM_TOKENS: Record<string, number> = {
  easy: 2,
  medium: 5,
  hard: 10,
};
export const LESSON_TOKENS = 2;
export const ASSIGNMENT_TOKENS = 4;
export const QUIZ_PASS_TOKENS = 5; // flat, once per quiz on pass
export const REVIEW_TOKENS_MULTIPLIER = 1; // tokens = round(score), e.g. score 8/10 -> 8 tokens
export const ADAPTIVE_PASS_TOKENS = 12; // per module passed
export const ADAPTIVE_PARTIAL_TOKENS = 5;
export const CHAPTER_CLEAR_TOKENS = 8;
export const CONTEST_FINISH_TOKENS = 6; // participation (finishing a contest)
export const GAME_PARTICIPATION_TOKENS = 4;
export const HELP_REQUEST_TOKENS = 2; // posting a help request
export const HELP_SOLUTION_TOKENS = 10; // reply marked as solution
export const BUG_REPORT_TOKENS = 8; // when a reported bug is resolved
export const HACKTEST_TOKENS = 10; // when a proposed hack test is approved
export const ATTENDANCE_TOKENS = 2; // per session marked present

function difficultyTokens(difficulty: string, t: any): number {
  switch (difficulty) {
    case "easy":
      return t.problemEasyTokens;
    case "hard":
      return t.problemHardTokens;
    default:
      return t.problemMediumTokens;
  }
}

export interface AwardOptions {
  reason: string;
  description?: string;
  refType?: string;
  refId?: string;
  /** Optional idempotency key; when set, the transaction row carries it and a duplicate
   *  (same key) is silently ignored instead of double-applied. Used by admin grants. */
  dedupKey?: string;
}

export interface AwardResult {
  awarded: boolean;
  balance: number;
  amount: number;
}

/**
 * Award tokens to a user. Idempotent when refType+refId are provided:
 * enforced at the DB layer via a unique `dedupKey` (set only on earn/grant rows),
 * so concurrent duplicate calls cannot double-award. Always keeps
 * User.tokenBalance in sync via a single transaction.
 */
export async function awardTokens(
  userId: string,
  amount: number,
  opts: AwardOptions
): Promise<AwardResult> {
  if (amount <= 0) return { awarded: false, balance: await getTokenBalance(userId), amount: 0 };

  const dedupKey = opts.refType && opts.refId ? `${userId}_${opts.refType}_${opts.refId}` : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
      const balanceAfter = (user?.tokenBalance ?? 0) + amount;
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount,
          balanceAfter,
          type: "earn",
          reason: opts.reason,
          description: opts.description,
          refType: opts.refType,
          refId: opts.refId,
          dedupKey,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { tokenBalance: balanceAfter } });
      return balanceAfter;
    });
    notifyWalletChanged(userId);
    return { awarded: true, balance: result, amount };
  } catch (err: any) {
    // P2002 = unique constraint violation on dedupKey → already awarded
    if (err?.code === "P2002") {
      return { awarded: false, balance: await getTokenBalance(userId), amount };
    }
    throw err;
  }
}

/**
 * Spend tokens. Atomic: refuses if insufficient balance.
 * Returns the new balance, or throws if funds are insufficient.
 */
export async function spendTokens(
  userId: string,
  amount: number,
  opts: AwardOptions
): Promise<number> {
  if (amount <= 0) throw new Error("Spend amount must be positive");

  const balance = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
    const current = user?.tokenBalance ?? 0;
    if (current < amount) {
      throw new Error("Số dư token không đủ");
    }
    const balanceAfter = current - amount;
    await tx.tokenTransaction.create({
      data: {
        userId,
        amount: -amount,
        balanceAfter,
        type: "spend",
        reason: opts.reason,
        description: opts.description,
        refType: opts.refType,
        refId: opts.refId,
      },
    });
    await tx.user.update({ where: { id: userId }, data: { tokenBalance: balanceAfter } });
    return balanceAfter;
  });
  notifyWalletChanged(userId);
  return balance;
}

/**
 * Admin grant (can be positive or negative). Bypasses the insufficient-balance check.
 * Idempotent when `opts.dedupKey` is provided: a duplicate key is ignored (P2002)
 * and the current balance is returned, so a retried request cannot double-apply.
 */
export async function adjustTokens(
  userId: string,
  amount: number,
  opts: AwardOptions
): Promise<number> {
  try {
    const balance = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
      const current = user?.tokenBalance ?? 0;
      // Record the amount actually applied so the ledger stays in sync with the balance:
      // a negative grant never nets below 0, so clamp the recorded amount too.
      const applied = amount < 0 ? Math.max(amount, -current) : amount;
      const balanceAfter = Math.max(0, current + amount);
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: applied,
          balanceAfter,
          type: "admin_adjust",
          reason: opts.reason,
          description: opts.description,
          refType: opts.refType,
          refId: opts.refId,
          dedupKey: opts.dedupKey ?? null,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { tokenBalance: balanceAfter } });
      return balanceAfter;
    });
    notifyWalletChanged(userId);
    return balance;
  } catch (err: any) {
    // P2002 = unique constraint on dedupKey → this grant was already applied
    if (err?.code === "P2002") {
      return getTokenBalance(userId);
    }
    throw err;
  }
}

export async function getTokenBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
  return user?.tokenBalance ?? 0;
}

// ─────────────────────────────────────────────
// Activity-specific award helpers (read configured rates from settings)
// Each is idempotent via refType+refId, so it is safe to call fire-and-forget.
// ─────────────────────────────────────────────

interface Ref {
  refType: string;
  refId: string;
  description: string;
}

export async function awardProblemTokens(userId: string, difficulty: string, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, difficultyTokens(difficulty, tokens), { reason: "problem_solved", ...ref });
}

export async function awardLessonTokens(userId: string, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.lessonTokens, { reason: "lesson_completed", ...ref });
}

export async function awardAssignmentTokens(userId: string, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.assignmentTokens, { reason: "assignment_submitted", ...ref });
}

export async function awardQuizPassTokens(userId: string, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.quizPassTokens, { reason: "quiz_passed", ...ref });
}

export async function awardReviewTokens(userId: string, score: number, maxScore: number, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  const scaled = maxScore > 0 ? Math.max(0, Math.round((score / maxScore) * 10)) : Math.max(0, Math.round(score));
  const amount = Math.round(scaled * tokens.reviewTokensMultiplier);
  return awardTokens(userId, amount, { reason: "review_received", ...ref });
}

export async function awardAdaptivePassTokens(userId: string, passed: boolean, partial: boolean, moduleId: string): Promise<void> {
  const { tokens } = await getRates();
  if (passed) {
    await awardTokens(userId, tokens.adaptivePassTokens, { reason: "adaptive_passed", description: "Vượt bài kiểm tra chương", refType: "AdaptiveTest", refId: moduleId });
    await awardTokens(userId, tokens.chapterClearTokens, { reason: "chapter_cleared", description: "Xóa chương học", refType: "Chapter", refId: moduleId });
  } else if (partial) {
    await awardTokens(userId, tokens.adaptivePartialTokens, { reason: "adaptive_partial", description: "Đạt một phần bài kiểm tra chương", refType: "AdaptiveTest", refId: moduleId });
  }
}

export async function awardContestFinishTokens(userId: string, contestId: string, ref: Ref): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.contestFinishTokens, { reason: "contest_finished", refType: "ContestFinish", refId: `${contestId}_${userId}`, description: ref.description });
}

export async function awardGameTokens(matchId: string, userId: string): Promise<void> {
  const { tokens } = await getRates();
  await awardTokens(userId, tokens.gameParticipationTokens, { reason: "game_participated", description: "Tham gia game AI Fortress Capture", refType: "GameMatch", refId: `${matchId}_${userId}` });
}

export async function awardHelpSolutionTokens(userId: string, replyId: string): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.helpSolutionTokens, { reason: "help_solution", description: "Câu trả lời được chọn là giải pháp", refType: "HelpReplySolution", refId: replyId });
}

export async function awardHelpRequestTokens(userId: string, requestId: string, title: string): Promise<AwardResult> {
  const { tokens } = await getRates();
  // Cap by user+day to prevent farming via repeated request creation
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return awardTokens(userId, tokens.helpRequestTokens, {
    reason: "help_request_posted",
    description: `Đặt câu hỏi: ${title}`,
    refType: "HelpRequestDaily",
    refId: `${userId}_${dayKey}`,
  });
}

export async function awardBugReportTokens(userId: string, bugId: string, title: string): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.bugReportTokens, { reason: "bug_resolved", description: `Báo lỗi được xử lý: ${title}`, refType: "BugReport", refId: bugId });
}

export async function awardHacktestTokens(userId: string, hackTestId: string, title: string): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.hacktestTokens, { reason: "hacktest_approved", description: `Đề xuất test case được duyệt: ${title}`, refType: "HackTest", refId: hackTestId });
}

export async function awardAttendanceTokens(userId: string, checkInId: string): Promise<AwardResult> {
  const { tokens } = await getRates();
  return awardTokens(userId, tokens.attendanceTokens, { reason: "attendance_present", description: "Điểm danh có mặt", refType: "DailyCheckIn", refId: checkInId });
}
