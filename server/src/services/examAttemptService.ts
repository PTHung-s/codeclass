/**
 * Attempt lifecycle helpers: expire, access, rate limits, language lock.
 */
import prisma from "../utils/prisma";
import { isStaffRole, safeJsonParse } from "./examTypes";
import { ExamMsg } from "./examMessages";
import type { Exam, ExamAttempt } from "@prisma/client";

const runSampleHits = new Map<string, number[]>();
const genTestLocks = new Set<string>();
const heartbeatHits = new Map<string, number[]>();

function pruneHits(arr: number[], windowMs: number, now: number) {
  while (arr.length && now - arr[0] > windowMs) arr.shift();
}

/** Simple sliding-window rate limit. Returns retryAfterMs if limited. */
export function hitRateLimit(
  map: Map<string, number[]>,
  key: string,
  maxHits: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const arr = map.get(key) || [];
  pruneHits(arr, windowMs, now);
  if (arr.length >= maxHits) {
    const retryAfterMs = Math.max(0, windowMs - (now - arr[0]));
    map.set(key, arr);
    return { ok: false, retryAfterMs };
  }
  arr.push(now);
  map.set(key, arr);
  return { ok: true };
}

export function rateLimitRunSample(userId: string, examId: string) {
  return hitRateLimit(runSampleHits, `${userId}:${examId}`, 8, 30_000);
}

export function rateLimitHeartbeat(userId: string, examId: string) {
  return hitRateLimit(heartbeatHits, `${userId}:${examId}`, 30, 60_000);
}

export function tryAcquireGenLock(questionId: string): boolean {
  if (genTestLocks.has(questionId)) return false;
  genTestLocks.add(questionId);
  return true;
}

export function releaseGenLock(questionId: string) {
  genTestLocks.delete(questionId);
}

export async function expireAttemptIfNeeded(
  attempt: Pick<ExamAttempt, "id" | "status" | "expiresAt" | "submittedAt" | "pauseJson">,
  now = new Date(),
): Promise<{ changed: boolean }> {
  if (attempt.status !== "in_progress") return { changed: false };
  if (attempt.expiresAt.getTime() > now.getTime()) return { changed: false };
  // Bài đang bị tạm dừng → không cho hết hạn (resume sẽ cộng lại thời gian).
  const pause = safeJsonParse<{ paused?: boolean } | null>(attempt.pauseJson ?? null, null);
  if (pause?.paused) return { changed: false };
  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "expired",
      submittedAt: attempt.submittedAt ?? now,
    },
  });
  return { changed: true };
}

/** Bulk expire for one exam or global stale in_progress rows. */
export async function expireStaleAttempts(examId?: string): Promise<number> {
  const now = new Date();
  // Không quét nốt các bài đang tạm dừng
  const pausedRows = await prisma.examAttempt.findMany({
    where: { status: "in_progress", pauseJson: { not: null }, ...(examId ? { examId } : {}) },
    select: { id: true, pauseJson: true },
  });
  const pausedIds = pausedRows
    .filter((a) => safeJsonParse<{ paused?: boolean } | null>(a.pauseJson, null)?.paused)
    .map((a) => a.id);
  const result = await prisma.examAttempt.updateMany({
    where: {
      status: "in_progress",
      expiresAt: { lte: now },
      ...(examId ? { examId } : {}),
      ...(pausedIds.length ? { id: { notIn: pausedIds } } : {}),
    },
    data: {
      status: "expired",
      submittedAt: now,
    },
  });
  return result.count;
}

export type AccessResult =
  | { ok: true; exam: Exam; reason?: string }
  | { ok: false; code: number; error: string; exam?: Exam };

/**
 * Student may view exam detail when:
 * - staff, or
 * - published + in open window + course member (if course-bound), or
 * - already has an attempt (resume/result) even if exam closed
 */
export async function assertExamReadAccess(
  examId: string,
  userId: string,
  role: string,
): Promise<AccessResult> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return { ok: false, code: 404, error: ExamMsg.notFound };
  if (isStaffRole(role)) return { ok: true, exam };

  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: userId } },
    select: { id: true, status: true },
  });

  // Existing attempt: can open lobby/result/take (take still checks writable)
  if (attempt) return { ok: true, exam, reason: "has_attempt" };

  if (exam.status !== "published") {
    return { ok: false, code: 403, error: ExamMsg.examNotOpen, exam };
  }
  const now = new Date();
  if (exam.openAt && exam.openAt > now) {
    return { ok: false, code: 403, error: ExamMsg.notYetOpen, exam };
  }
  if (exam.closeAt && exam.closeAt < now) {
    return { ok: false, code: 403, error: ExamMsg.pastDeadline, exam };
  }
  return { ok: true, exam };
}

/** Starting a new attempt requires published + window; resume uses read access. */
export async function assertExamStartAccess(
  examId: string,
  userId: string,
  role: string,
): Promise<AccessResult> {
  const base = await assertExamReadAccess(examId, userId, role);
  if (!base.ok) return base;
  if (isStaffRole(role)) return base;

  const existing = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: userId } },
    select: { id: true, status: true },
  });
  if (existing) return base; // resume path

  if (base.exam.status !== "published") {
    return { ok: false, code: 403, error: ExamMsg.examNotOpenStart, exam: base.exam };
  }
  const now = new Date();
  if (base.exam.openAt && base.exam.openAt > now) {
    return { ok: false, code: 403, error: ExamMsg.notYetOpen, exam: base.exam };
  }
  if (base.exam.closeAt && base.exam.closeAt < now) {
    return { ok: false, code: 403, error: ExamMsg.pastRegister, exam: base.exam };
  }
  return base;
}

export function resolveCodeLanguage(
  questionLanguage: string | null | undefined,
  requested: string | null | undefined,
): string {
  const qLang = (questionLanguage || "python").toLowerCase();
  if (qLang === "python" || qLang === "cpp") return qLang;
  const req = (requested || "python").toLowerCase();
  return req === "cpp" ? "cpp" : "python";
}

/** Mark stale grade jobs left running after process crash. */
export async function recoverStaleGradeJobs(maxAgeMs = 30 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await prisma.examGradeJob.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      error: "Job bị gián đoạn (server restart/timeout) — hãy chạy chấm lại",
      finishedAt: new Date(),
    },
  });
  return result.count;
}

let lastSweepAt = 0;
/** Cheap periodic sweep from hot paths (answers/heartbeat). */
export async function maybeSweepExpiredAttempts() {
  const now = Date.now();
  if (now - lastSweepAt < 15_000) return;
  lastSweepAt = now;
  await expireStaleAttempts();
  await recoverStaleGradeJobs();
}
