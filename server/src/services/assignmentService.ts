import prisma from "../utils/prisma";
import { notifyNotificationChanged } from "./notificationEvents";
import { getRates } from "../utils/gamificationSettings";
import { awardTokens } from "../utils/tokens";
import { awardXp } from "../utils/xpLedger";
import { getPrerequisiteAncestors, SKILL_SEEDS, skillIdToName, skillIdToTopic } from "../utils/skillGraph";
import { applyMemoryDecay, countSpacedSuccesses, getSkillStates, REVIEW_RETENTION_THRESHOLD } from "./skillMastery";

export const ACTIVE_SUBMISSION_TYPES = ["problem", "quiz", "lesson", "mixed"] as const;
export type AssignmentItemType = "problem" | "quiz" | "lesson";
export type AssignmentProgressStatus = "not_started" | "attempting" | "passed";

export interface NormalizedAssignmentItem {
  id: string;
  itemType: AssignmentItemType;
  problemId: string | null;
  quizId: string | null;
  lessonId: string | null;
  title: string;
  difficulty: string | null;
  courseTitle: string | null;
  linkPath: string;
}

export interface SubmissionAttemptStat {
  attempts: number;
  passed: boolean;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  passedAt: Date | null;
  latestSubmissionId?: string | null;
  scoreLabel?: string | null;
}

export interface EvaluatedItemProgress extends NormalizedAssignmentItem {
  status: AssignmentProgressStatus;
  attempts: number;
  passed: boolean;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  passedAt: Date | null;
  isLate: boolean;
  closedAfterDeadline: boolean;
  latestSubmissionId: string | null;
  scoreLabel: string | null;
}

export interface AggregatedAssignmentProgress {
  status: AssignmentProgressStatus;
  passed: boolean;
  totalItems: number;
  completedItems: number;
  attemptedItems: number;
  attempts: number;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  completedAt: Date | null;
  isLate: boolean;
  overdue: boolean;
  locked: boolean;
  closedAfterDeadline: boolean;
  items: EvaluatedItemProgress[];
}

export interface RawAssignmentForEval {
  id: string;
  title: string;
  deadline: Date | null;
  strictDeadline?: boolean | null;
  submissionType?: string | null;
  problemId?: string | null;
  lessonId?: string | null;
  problem?: { id: string; title: string; difficulty: string } | null;
  lesson?: { id: string; title: string; course?: { id: string; title: string } | null } | null;
  items?: Array<{
    id: string;
    itemType: string;
    orderIndex: number;
    problemId: string | null;
    quizId: string | null;
    lessonId: string | null;
    problem?: { id: string; title: string; difficulty: string } | null;
    quiz?: {
      id: string;
      title: string;
      lessonId: string;
      lesson?: { id: string; title: string; course?: { id: string; title: string } | null } | null;
    } | null;
    lesson?: { id: string; title: string; course?: { id: string; title: string } | null } | null;
  }>;
}

export function deriveSubmissionType(items: Array<{ itemType: string }>): "problem" | "quiz" | "lesson" | "mixed" {
  const types = new Set(items.map((i) => i.itemType));
  if (types.size === 1) {
    const only = [...types][0];
    if (only === "problem" || only === "quiz" || only === "lesson") return only;
  }
  return "mixed";
}

export function normalizeAssignmentItems(assignment: RawAssignmentForEval): NormalizedAssignmentItem[] {
  if (assignment.items && assignment.items.length > 0) {
    const sorted = [...assignment.items].sort((a, b) => a.orderIndex - b.orderIndex);
    return sorted.map((it) => {
      if (it.itemType === "quiz") {
        const lid = it.quiz?.lessonId ?? it.lessonId ?? null;
        return {
          id: it.id,
          itemType: "quiz",
          problemId: null,
          quizId: it.quizId ?? it.quiz?.id ?? null,
          lessonId: lid,
          title: it.quiz?.title ?? "Bài kiểm tra",
          difficulty: null,
          courseTitle: it.quiz?.lesson?.course?.title ?? null,
          linkPath: lid ? `/lessons/${lid}/quiz` : "/courses",
        };
      }
      if (it.itemType === "lesson") {
        const lid = it.lessonId ?? it.lesson?.id ?? null;
        return {
          id: it.id,
          itemType: "lesson",
          problemId: null,
          quizId: null,
          lessonId: lid,
          title: it.lesson?.title ?? "Bài học",
          difficulty: null,
          courseTitle: it.lesson?.course?.title ?? null,
          linkPath: lid ? `/lessons/${lid}` : "/courses",
        };
      }
      const pid = it.problemId ?? it.problem?.id ?? null;
      return {
        id: it.id,
        itemType: "problem",
        problemId: pid,
        quizId: null,
        lessonId: null,
        title: it.problem?.title ?? "Bài lập trình",
        difficulty: it.problem?.difficulty ?? null,
        courseTitle: null,
        linkPath: pid ? `/problems/${pid}` : "/problems",
      };
    });
  }

  // Legacy single-item fallback (assignments created before AssignmentItem table)
  if (assignment.problemId || assignment.problem) {
    const pid = assignment.problemId ?? assignment.problem?.id ?? null;
    return [
      {
        id: `legacy-problem-${pid ?? assignment.id}`,
        itemType: "problem",
        problemId: pid,
        quizId: null,
        lessonId: null,
        title: assignment.problem?.title ?? assignment.title,
        difficulty: assignment.problem?.difficulty ?? null,
        courseTitle: null,
        linkPath: pid ? `/problems/${pid}` : "/problems",
      },
    ];
  }

  if (assignment.lessonId || assignment.lesson) {
    const lid = assignment.lessonId ?? assignment.lesson?.id ?? null;
    return [
      {
        id: `legacy-lesson-${lid ?? assignment.id}`,
        itemType: "lesson",
        problemId: null,
        quizId: null,
        lessonId: lid,
        title: assignment.lesson?.title ?? assignment.title,
        difficulty: null,
        courseTitle: assignment.lesson?.course?.title ?? null,
        linkPath: lid ? `/lessons/${lid}` : "/courses",
      },
    ];
  }

  return [];
}

function evaluateAttemptBasedItem(
  item: NormalizedAssignmentItem,
  stat: SubmissionAttemptStat | undefined,
  deadline: Date | null,
  strictDeadline: boolean,
): EvaluatedItemProgress {
  const attempts = stat?.attempts ?? 0;
  const rawPassed = !!stat?.passed;
  const passedAt = stat?.passedAt ?? null;
  const firstAttemptAt = stat?.firstAttemptAt ?? null;
  const lastAttemptAt = stat?.lastAttemptAt ?? null;
  const latestSubmissionId = stat?.latestSubmissionId ?? null;
  const scoreLabel = stat?.scoreLabel ?? null;

  if (attempts === 0) {
    return {
      ...item,
      status: "not_started",
      attempts: 0,
      passed: false,
      firstAttemptAt: null,
      lastAttemptAt: null,
      passedAt: null,
      isLate: false,
      closedAfterDeadline: false,
      latestSubmissionId,
      scoreLabel,
    };
  }

  if (rawPassed && passedAt) {
    // Check lateness against earliest passing timestamp so failed attempts before
    // deadline followed by AC after deadline are properly flagged as late.
    const isLate = !!deadline && passedAt > deadline;
    const closedAfterDeadline = !!strictDeadline && isLate;
    return {
      ...item,
      status: closedAfterDeadline ? "attempting" : "passed",
      attempts,
      passed: !closedAfterDeadline,
      firstAttemptAt,
      lastAttemptAt,
      passedAt,
      isLate,
      closedAfterDeadline,
      latestSubmissionId,
      scoreLabel,
    };
  }

  return {
    ...item,
    status: "attempting",
    attempts,
    passed: false,
    firstAttemptAt,
    lastAttemptAt,
    passedAt: null,
    isLate: !!deadline && !!firstAttemptAt && firstAttemptAt > deadline,
    closedAfterDeadline: false,
    latestSubmissionId,
    scoreLabel,
  };
}

export function evaluateProblemItem(
  item: NormalizedAssignmentItem,
  stat: SubmissionAttemptStat | undefined,
  deadline: Date | null,
  strictDeadline: boolean,
): EvaluatedItemProgress {
  return evaluateAttemptBasedItem(item, stat, deadline, strictDeadline);
}

export function evaluateQuizItem(
  item: NormalizedAssignmentItem,
  stat: SubmissionAttemptStat | undefined,
  deadline: Date | null,
  strictDeadline: boolean,
): EvaluatedItemProgress {
  return evaluateAttemptBasedItem(item, stat, deadline, strictDeadline);
}

export function evaluateLessonItem(
  item: NormalizedAssignmentItem,
  completedAt: Date | null | undefined,
  deadline: Date | null,
  strictDeadline: boolean,
): EvaluatedItemProgress {
  if (!completedAt) {
    return {
      ...item,
      status: "not_started",
      attempts: 0,
      passed: false,
      firstAttemptAt: null,
      lastAttemptAt: null,
      passedAt: null,
      isLate: false,
      closedAfterDeadline: false,
      latestSubmissionId: null,
      scoreLabel: null,
    };
  }
  const isLate = !!deadline && completedAt > deadline;
  const closedAfterDeadline = !!strictDeadline && isLate;
  return {
    ...item,
    status: closedAfterDeadline ? "attempting" : "passed",
    attempts: 1,
    passed: !closedAfterDeadline,
    firstAttemptAt: completedAt,
    lastAttemptAt: completedAt,
    passedAt: completedAt,
    isLate,
    closedAfterDeadline,
    latestSubmissionId: null,
    scoreLabel: null,
  };
}

export function aggregateStudentAssignmentProgress(
  itemResults: EvaluatedItemProgress[],
  deadline: Date | null,
  strictDeadline: boolean,
  now: Date = new Date(),
): AggregatedAssignmentProgress {
  const totalItems = itemResults.length;
  const completedItems = itemResults.filter((i) => i.passed).length;
  const attemptedItems = itemResults.filter((i) => i.status !== "not_started").length;
  const attempts = itemResults.reduce((sum, i) => sum + i.attempts, 0);
  const passed = totalItems > 0 && completedItems === totalItems;
  const status: AssignmentProgressStatus = passed ? "passed" : attemptedItems > 0 ? "attempting" : "not_started";

  let firstAttemptAt: Date | null = null;
  let lastAttemptAt: Date | null = null;
  let latestPassedAt: Date | null = null;

  for (const res of itemResults) {
    if (res.firstAttemptAt && (!firstAttemptAt || res.firstAttemptAt < firstAttemptAt)) {
      firstAttemptAt = res.firstAttemptAt;
    }
    if (res.lastAttemptAt && (!lastAttemptAt || res.lastAttemptAt > lastAttemptAt)) {
      lastAttemptAt = res.lastAttemptAt;
    }
    if (res.passedAt && (!latestPassedAt || res.passedAt > latestPassedAt)) {
      latestPassedAt = res.passedAt;
    }
  }

  const completedAt = passed ? latestPassedAt : null;
  const isLate = passed && completedAt
    ? !!deadline && completedAt > deadline
    : attemptedItems > 0
      ? itemResults.some((i) => i.isLate)
      : false;
  const overdue = !!deadline && deadline < now && status !== "passed";
  const locked = !!strictDeadline && !!deadline && now > deadline && status !== "passed";
  const closedAfterDeadline = itemResults.some((i) => i.closedAfterDeadline);

  return {
    status,
    passed,
    totalItems,
    completedItems,
    attemptedItems,
    attempts,
    firstAttemptAt,
    lastAttemptAt,
    completedAt,
    isLate,
    overdue,
    locked,
    closedAfterDeadline,
    items: itemResults,
  };
}

export const assignmentItemInclude = {
  items: {
    orderBy: { orderIndex: "asc" as const },
    include: {
      problem: { select: { id: true, title: true, difficulty: true } },
      quiz: {
        select: {
          id: true,
          title: true,
          lessonId: true,
          lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
        },
      },
      lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
    },
  },
  problem: { select: { id: true, title: true, difficulty: true } },
  lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
};

/**
 * Batch-evaluate a list of assignments across a set of students using at most
 * 3 DB queries (problem submissions, quiz attempts, lesson completions).
 */
export async function evaluateAssignmentsForStudents(
  assignments: RawAssignmentForEval[],
  studentIds: string[],
  now: Date = new Date(),
): Promise<Map<string, AggregatedAssignmentProgress>> {
  const result = new Map<string, AggregatedAssignmentProgress>();
  if (!assignments.length || !studentIds.length) return result;

  const normalizedByAssignment = new Map<string, NormalizedAssignmentItem[]>();
  const problemIds = new Set<string>();
  const quizIds = new Set<string>();
  const lessonIds = new Set<string>();

  for (const a of assignments) {
    const items = normalizeAssignmentItems(a);
    normalizedByAssignment.set(a.id, items);
    for (const it of items) {
      if (it.itemType === "problem" && it.problemId) problemIds.add(it.problemId);
      else if (it.itemType === "quiz" && it.quizId) quizIds.add(it.quizId);
      else if (it.itemType === "lesson" && it.lessonId) lessonIds.add(it.lessonId);
    }
  }

  const [problemSubs, quizAttempts, lessonProgresses] = await Promise.all([
    problemIds.size > 0
      ? prisma.problemSubmission.findMany({
          where: { problemId: { in: [...problemIds] }, studentId: { in: studentIds } },
          select: { id: true, problemId: true, studentId: true, passed: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    quizIds.size > 0
      ? prisma.quizAttempt.findMany({
          where: { quizId: { in: [...quizIds] }, userId: { in: studentIds } },
          select: { id: true, quizId: true, userId: true, score: true, totalQuestions: true, passed: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    lessonIds.size > 0
      ? prisma.lessonProgress.findMany({
          where: { lessonId: { in: [...lessonIds] }, userId: { in: studentIds } },
          select: { lessonId: true, userId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const problemStatMap = new Map<string, SubmissionAttemptStat>();
  for (const s of problemSubs) {
    const key = `${s.problemId}:${s.studentId}`;
    const stat = problemStatMap.get(key) ?? {
      attempts: 0,
      passed: false,
      firstAttemptAt: null,
      lastAttemptAt: null,
      passedAt: null,
      latestSubmissionId: null,
    };
    stat.attempts += 1;
    if (!stat.firstAttemptAt) stat.firstAttemptAt = s.createdAt;
    stat.lastAttemptAt = s.createdAt;
    if (s.passed) {
      if (!stat.passed) stat.passedAt = s.createdAt;
      stat.passed = true;
      stat.latestSubmissionId = s.id;
    } else if (!stat.passed) {
      stat.latestSubmissionId = s.id;
    }
    problemStatMap.set(key, stat);
  }

  const quizStatMap = new Map<string, SubmissionAttemptStat & { bestPct: number }>();
  for (const qa of quizAttempts) {
    const key = `${qa.quizId}:${qa.userId}`;
    const stat = quizStatMap.get(key) ?? {
      attempts: 0,
      passed: false,
      firstAttemptAt: null,
      lastAttemptAt: null,
      passedAt: null,
      latestSubmissionId: null,
      scoreLabel: null,
      bestPct: -1,
    };
    stat.attempts += 1;
    if (!stat.firstAttemptAt) stat.firstAttemptAt = qa.createdAt;
    stat.lastAttemptAt = qa.createdAt;
    if (qa.passed && !stat.passed) {
      stat.passed = true;
      stat.passedAt = qa.createdAt;
    }
    stat.latestSubmissionId = qa.id;
    const pct = qa.totalQuestions > 0 ? qa.score / qa.totalQuestions : 0;
    if (pct >= stat.bestPct) {
      stat.bestPct = pct;
      stat.scoreLabel = `${qa.score}/${qa.totalQuestions}`;
    }
    quizStatMap.set(key, stat);
  }

  const lessonMap = new Map<string, Date>();
  for (const lp of lessonProgresses) {
    lessonMap.set(`${lp.lessonId}:${lp.userId}`, lp.completedAt);
  }

  for (const a of assignments) {
    const items = normalizedByAssignment.get(a.id) ?? [];
    const strictDeadline = !!a.strictDeadline;
    for (const studentId of studentIds) {
      const evaluatedItems = items.map((item) => {
        if (item.itemType === "problem") {
          const stat = item.problemId ? problemStatMap.get(`${item.problemId}:${studentId}`) : undefined;
          return evaluateProblemItem(item, stat, a.deadline, strictDeadline);
        }
        if (item.itemType === "quiz") {
          const stat = item.quizId ? quizStatMap.get(`${item.quizId}:${studentId}`) : undefined;
          return evaluateQuizItem(item, stat, a.deadline, strictDeadline);
        }
        const completedAt = item.lessonId ? lessonMap.get(`${item.lessonId}:${studentId}`) : undefined;
        return evaluateLessonItem(item, completedAt, a.deadline, strictDeadline);
      });
      result.set(
        `${a.id}:${studentId}`,
        aggregateStudentAssignmentProgress(evaluatedItems, a.deadline, strictDeadline, now),
      );
    }
  }

  return result;
}

function formatDeadlineVi(deadline: Date | null): string {
  if (!deadline) return "";
  return deadline.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export function summarizeItemsText(items: Array<{ itemType: string; title?: string }>): string {
  if (!items.length) return "";
  if (items.length === 1 && items[0].title) return items[0].title;
  const counts = { problem: 0, quiz: 0, lesson: 0 };
  for (const it of items) {
    if (it.itemType === "problem") counts.problem += 1;
    else if (it.itemType === "quiz") counts.quiz += 1;
    else if (it.itemType === "lesson") counts.lesson += 1;
  }
  const parts: string[] = [];
  if (counts.problem) parts.push(`${counts.problem} bài code`);
  if (counts.quiz) parts.push(`${counts.quiz} quiz`);
  if (counts.lesson) parts.push(`${counts.lesson} bài học`);
  return parts.join(", ");
}

export async function notifyAssignmentAssigned(
  studentIds: string[],
  assignmentId: string,
  title: string,
  items: Array<{ itemType: string; title?: string }>,
  deadline: Date | null,
) {
  if (!studentIds.length) return;
  const summary = summarizeItemsText(items);
  const deadlineText = deadline ? ` Hạn chót: ${formatDeadlineVi(deadline)}.` : "";
  await prisma.notification.createMany({
    data: studentIds.map((userId) => ({
      userId,
      title: "Bài tập mới",
      message: `Bạn được giao bài tập "${title}"${summary ? ` (${summary})` : ""}.${deadlineText} Vào mục "Bài tập của tôi" để làm.`,
      type: "assignment",
      relatedEntityType: "assignment",
      relatedEntityId: assignmentId,
    })),
  });
  for (const uid of studentIds) {
    notifyNotificationChanged(uid);
  }
}

export async function notifyAssignmentReminder(
  studentIds: string[],
  assignmentId: string,
  title: string,
  items: Array<{ itemType: string; title?: string }>,
  deadline: Date | null,
) {
  if (!studentIds.length) return;
  const summary = summarizeItemsText(items);
  const deadlineText = deadline ? ` Hạn chót: ${formatDeadlineVi(deadline)}.` : "";
  await prisma.notification.createMany({
    data: studentIds.map((userId) => ({
      userId,
      title: "Nhắc hạn bài tập",
      message: `Bài tập "${title}"${summary ? ` (${summary})` : ""} chưa hoàn thành.${deadlineText} Nhớ vào làm đúng hạn nhé.`,
      type: "assignment_reminder",
      relatedEntityType: "assignment",
      relatedEntityId: assignmentId,
    })),
  });
  for (const uid of studentIds) {
    notifyNotificationChanged(uid);
  }
}

async function notifyAssignmentReward(
  studentId: string,
  assignmentId: string,
  title: string,
  tokens: number,
  xp: number,
) {
  const parts: string[] = [];
  if (tokens > 0) parts.push(`+${tokens} Token`);
  if (xp > 0) parts.push(`+${xp} XP`);
  if (!parts.length) return;
  await prisma.notification.create({
    data: {
      userId: studentId,
      title: "Thưởng hoàn thành bài tập",
      message: `Bạn đã hoàn thành đúng hạn bài tập "${title}" và nhận ${parts.join(", ")}!`,
      type: "assignment_reward",
      relatedEntityType: "assignment",
      relatedEntityId: assignmentId,
    },
  });
  notifyNotificationChanged(studentId);
}

/**
 * Smart course/roster student resolution:
 * Checks CourseMember first, falls back to students active in that course's
 * lessons/quizzes, and finally falls back to the active student roster.
 */
export async function resolveCourseStudents(courseId?: string | null): Promise<{
  studentIds: string[];
  source: "course_members" | "course_activity" | "active_roster";
}> {
  if (courseId) {
    const members = await prisma.courseMember.findMany({
      where: {
        courseId,
        roleInCourse: "student",
        status: "active",
        user: { role: "student", status: "active" },
      },
      select: { userId: true },
    });
    if (members.length > 0) {
      return {
        studentIds: [...new Set(members.map((m) => m.userId))],
        source: "course_members",
      };
    }

    const [lessonUsers, quizUsers] = await Promise.all([
      prisma.lessonProgress.findMany({
        where: {
          lesson: { courseId },
          user: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.quizAttempt.findMany({
        where: {
          quiz: { lesson: { courseId } },
          user: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    const activityIds = [...new Set([...lessonUsers.map((u) => u.userId), ...quizUsers.map((u) => u.userId)])];
    if (activityIds.length > 0) {
      return { studentIds: activityIds, source: "course_activity" };
    }
  }

  const activeStudents = await prisma.user.findMany({
    where: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
    select: { id: true },
    orderBy: { fullName: "asc" },
  });
  return {
    studentIds: activeStudents.map((s) => s.id),
    source: "active_roster",
  };
}

/**
 * Called fire-and-forget when a student passes a problem, passes a quiz, or
 * completes a lesson. Checks matching assignments and awards idempotent
 * on-time completion tokens & XP.
 */
export async function checkAndAwardAssignmentRewards(
  studentId: string,
  trigger: { problemId?: string; quizId?: string; lessonId?: string },
) {
  const orConditions: Record<string, unknown>[] = [];
  if (trigger.problemId) {
    orConditions.push({ problemId: trigger.problemId });
    orConditions.push({ items: { some: { problemId: trigger.problemId } } });
  }
  if (trigger.quizId) {
    orConditions.push({ items: { some: { quizId: trigger.quizId } } });
  }
  if (trigger.lessonId) {
    orConditions.push({ lessonId: trigger.lessonId });
    orConditions.push({ items: { some: { lessonId: trigger.lessonId } } });
  }
  if (!orConditions.length) return;

  const links = await prisma.assignmentStudent.findMany({
    where: {
      studentId,
      assignment: {
        status: "published",
        submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] },
        OR: orConditions,
      },
    },
    include: {
      assignment: {
        include: assignmentItemInclude,
      },
    },
  });
  if (!links.length) return;

  const assignments = links.map((l) => l.assignment);
  const progressMap = await evaluateAssignmentsForStudents(assignments, [studentId]);
  const rates = await getRates();
  const now = new Date();

  for (const link of links) {
    const a = link.assignment;
    const progress = progressMap.get(`${a.id}:${studentId}`);
    if (!progress || progress.status !== "passed") continue;

    if (!link.completedAt) {
      await prisma.assignmentStudent
        .update({
          where: { id: link.id },
          data: { completedAt: progress.completedAt ?? now },
        })
        .catch(() => {});
    }

    if (!a.rewardOnTime || progress.isLate || link.rewardedAt) continue;

    const totalTokens = Math.max(0, (rates.tokens.assignmentTokens || 0) + (a.bonusTokens || 0));
    const totalXp = Math.max(0, (rates.xp.submissionXp || 0) + (a.bonusXp || 0));

    let newlyAwardedTokens = 0;
    let newlyAwardedXp = 0;

    if (totalTokens > 0) {
      const tokRes = await awardTokens(studentId, totalTokens, {
        reason: "assignment_completed",
        description: `Hoàn thành đúng hạn bài tập: ${a.title}`,
        refType: "Assignment",
        refId: a.id,
      }).catch(() => ({ awarded: false, balance: 0, amount: 0 }));
      if (tokRes.awarded) newlyAwardedTokens = tokRes.amount;
    }

    if (totalXp > 0) {
      const xpOk = await awardXp(studentId, totalXp, {
        reason: "assignment_completed",
        description: `Hoàn thành đúng hạn bài tập: ${a.title}`,
        refType: "Assignment",
        refId: a.id,
      }).catch(() => false);
      if (xpOk) newlyAwardedXp = totalXp;
    }

    await prisma.assignmentStudent
      .update({
        where: { id: link.id },
        data: { rewardedAt: now },
      })
      .catch(() => {});

    if (newlyAwardedTokens > 0 || newlyAwardedXp > 0) {
      await notifyAssignmentReward(studentId, a.id, a.title, newlyAwardedTokens, newlyAwardedXp).catch(() => {});
    }
  }
}

/**
 * Automatic 24-hour pre-deadline reminder sweep. Atomically claims each eligible
 * assignment with `reminderSentAt: null` before emailing/notifying unfinished students.
 */
export async function sendDueSoonAssignmentReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dueSoon = await prisma.assignment.findMany({
    where: {
      status: "published",
      reminderSentAt: null,
      deadline: { gt: now, lte: horizon },
      submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] },
    },
    include: {
      ...assignmentItemInclude,
      assignedStudents: { select: { studentId: true } },
    },
  });
  if (!dueSoon.length) return 0;

  let totalNotified = 0;
  for (const a of dueSoon) {
    const claimed = await prisma.assignment.updateMany({
      where: { id: a.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue;

    const studentIds = a.assignedStudents.map((s) => s.studentId);
    if (!studentIds.length) continue;

    const progressMap = await evaluateAssignmentsForStudents([a], studentIds, now);
    const unfinished = studentIds.filter((sid) => {
      const prog = progressMap.get(`${a.id}:${sid}`);
      return !prog || prog.status !== "passed";
    });
    if (!unfinished.length) continue;

    const items = normalizeAssignmentItems(a);
    await notifyAssignmentReminder(unfinished, a.id, a.title, items, a.deadline).catch(() => {});
    totalNotified += unfinished.length;
  }

  return totalNotified;
}

/**
 * When a new student registers/is created, automatically attach all active
 * published assignments flagged with `autoAssignNewStudents: true` (that have
 * not yet passed their deadline).
 */
export async function syncAutoAssignmentsForStudent(studentId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.role !== "student" || user.status !== "active") return 0;

  const now = new Date();
  const candidates = await prisma.assignment.findMany({
    where: {
      status: "published",
      autoAssignNewStudents: true,
      submissionType: { in: [...ACTIVE_SUBMISSION_TYPES] },
      OR: [{ deadline: null }, { deadline: { gt: now } }],
    },
    include: assignmentItemInclude,
  });
  if (!candidates.length) return 0;

  const existingLinks = await prisma.assignmentStudent.findMany({
    where: { studentId, assignmentId: { in: candidates.map((c) => c.id) } },
    select: { assignmentId: true },
  });
  const have = new Set(existingLinks.map((l) => l.assignmentId));
  const missing = candidates.filter((c) => !have.has(c.id));
  if (!missing.length) return 0;

  await prisma.assignmentStudent.createMany({
    data: missing.map((a) => ({ assignmentId: a.id, studentId })),
  });

  for (const a of missing) {
    const items = normalizeAssignmentItems(a);
    await notifyAssignmentAssigned([studentId], a.id, a.title, items, a.deadline).catch(() => {});
  }
  return missing.length;
}

export interface WeakSkillAggregate {
  skillId: string;
  name: string;
  topicName: string;
  weakStudentCount: number;
  evaluatedCount: number;
  avgMastery: number;
  weakStudentIds: string[];
}

export interface DecayedSkillObservation {
  skillId: string;
  userId: string;
  decayedMastery: number;
  dueForReview: boolean;
}

/**
 * Pure aggregation: ranks canonical skills by how many active students are
 * currently weak (<65% decayed mastery) or due for spaced-repetition review.
 */
export function rankWeakSkillsForRemediation(
  rows: DecayedSkillObservation[],
  limit = 12,
): WeakSkillAggregate[] {
  const bySkill = new Map<
    string,
    { sumMastery: number; count: number; weakIds: Set<string> }
  >();
  for (const row of rows) {
    const bucket = bySkill.get(row.skillId) ?? { sumMastery: 0, count: 0, weakIds: new Set<string>() };
    bucket.sumMastery += row.decayedMastery;
    bucket.count += 1;
    if (row.decayedMastery < 0.65 || row.dueForReview) {
      bucket.weakIds.add(row.userId);
    }
    bySkill.set(row.skillId, bucket);
  }

  const out: WeakSkillAggregate[] = [];
  for (const [skillId, b] of bySkill.entries()) {
    if (b.count === 0) continue;
    out.push({
      skillId,
      name: skillIdToName(skillId),
      topicName: skillIdToTopic(skillId),
      weakStudentCount: b.weakIds.size,
      evaluatedCount: b.count,
      avgMastery: Math.round((b.sumMastery / b.count) * 1000) / 1000,
      weakStudentIds: [...b.weakIds],
    });
  }

  out.sort((a, b) => {
    if (b.weakStudentCount !== a.weakStudentCount) return b.weakStudentCount - a.weakStudentCount;
    return a.avgMastery - b.avgMastery;
  });

  return out.slice(0, limit);
}

interface RecommendedRemedialItem {
  itemType: AssignmentItemType;
  problemId: string | null;
  quizId: string | null;
  lessonId: string | null;
  title: string;
  difficulty: string | null;
  courseTitle: string | null;
  skillId: string;
  skillName: string;
  reason: string;
}

async function findRemedialItemsForSkills(
  primarySkillIds: string[],
  prereqSkillIds: string[],
  exclude?: { problems: Set<string>; quizzes: Set<string>; lessons: Set<string> },
  limit = 8,
): Promise<RecommendedRemedialItem[]> {
  const searchSkills = [...new Set([...primarySkillIds, ...prereqSkillIds])];
  if (!searchSkills.length) return [];
  const primarySet = new Set(primarySkillIds);

  const [problems, quizzes] = await Promise.all([
    prisma.problem.findMany({
      where: {
        status: { not: "archived" },
        skillTagStatus: "approved",
        skillId: { in: searchSkills },
      },
      select: { id: true, title: true, difficulty: true, skillId: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.quiz.findMany({
      where: {
        questions: {
          some: { skillTagStatus: "approved", skillId: { in: searchSkills } },
        },
      },
      select: {
        id: true,
        title: true,
        lessonId: true,
        lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
        questions: {
          where: { skillTagStatus: "approved", skillId: { in: searchSkills } },
          select: { skillId: true },
        },
      },
      take: 20,
    }),
  ]);

  const candidates: RecommendedRemedialItem[] = [];
  const seenKey = new Set<string>();

  const pushUnique = (item: RecommendedRemedialItem, isPrimary: boolean) => {
    const key = `${item.itemType}:${item.problemId || item.quizId || item.lessonId}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    candidates.push({
      ...item,
      reason: isPrimary ? "Đúng kỹ năng cần củng cố" : "Kỹ năng tiền đề",
    });
  };

  // Prefer primary skill items first, then prerequisites
  const sortedProblems = [...problems].sort((a, b) => {
    const ap = a.skillId && primarySet.has(a.skillId) ? 0 : 1;
    const bp = b.skillId && primarySet.has(b.skillId) ? 0 : 1;
    return ap - bp;
  });
  for (const p of sortedProblems) {
    if (exclude?.problems.has(p.id)) continue;
    const sid = p.skillId || searchSkills[0];
    pushUnique(
      {
        itemType: "problem",
        problemId: p.id,
        quizId: null,
        lessonId: null,
        title: p.title,
        difficulty: p.difficulty,
        courseTitle: null,
        skillId: sid,
        skillName: skillIdToName(sid),
        reason: "",
      },
      !!p.skillId && primarySet.has(p.skillId),
    );
  }

  for (const q of quizzes) {
    const matchedSid =
      q.questions.find((qq) => qq.skillId && primarySet.has(qq.skillId))?.skillId ??
      q.questions[0]?.skillId ??
      searchSkills[0];
    const isPrim = !!matchedSid && primarySet.has(matchedSid);
    if (!exclude?.quizzes.has(q.id)) {
      pushUnique(
        {
          itemType: "quiz",
          problemId: null,
          quizId: q.id,
          lessonId: q.lessonId,
          title: q.title,
          difficulty: null,
          courseTitle: q.lesson?.course?.title ?? null,
          skillId: matchedSid,
          skillName: skillIdToName(matchedSid),
          reason: "",
        },
        isPrim,
      );
    }
    if (q.lesson && !exclude?.lessons.has(q.lesson.id)) {
      pushUnique(
        {
          itemType: "lesson",
          problemId: null,
          quizId: null,
          lessonId: q.lesson.id,
          title: q.lesson.title,
          difficulty: null,
          courseTitle: q.lesson.course?.title ?? null,
          skillId: matchedSid,
          skillName: skillIdToName(matchedSid),
          reason: "",
        },
        isPrim,
      );
    }
  }

  // Prioritize uncompleted items; if everything was excluded, fall back without exclusion
  if (!candidates.length && exclude) {
    return findRemedialItemsForSkills(primarySkillIds, prereqSkillIds, undefined, limit);
  }

  return candidates.slice(0, limit);
}

function evaluateStoredMasteryRow(value: number, historyJson: string, nowMs: number) {
  let hist: Array<{ ts: string; value: number }> = [];
  try {
    const parsed = JSON.parse(historyJson || "[]");
    if (Array.isArray(parsed)) hist = parsed;
  } catch {
    hist = [];
  }
  if (!hist.length) return null;
  const lastEntry = hist[hist.length - 1];
  const lastMs = Date.parse(lastEntry?.ts || "");
  const daysElapsed = Number.isFinite(lastMs) ? Math.max(0, (nowMs - lastMs) / 86_400_000) : 0;
  const spacedCount = countSpacedSuccesses(hist);
  const dec = applyMemoryDecay(value, daysElapsed, spacedCount);
  return {
    effectiveMastery: dec.effectiveMastery,
    dueForReview: dec.retentionRate < REVIEW_RETENTION_THRESHOLD && value >= 0.5,
  };
}

/**
 * Connects Skill Mastery Engine (BKT-IRT + DAG + Memory Decay) with Assignments.
 * Mode 1: class-wide weakest skills.
 * Mode 2: specific skill -> struggling students + matching problems/quizzes/lessons.
 * Mode 3: specific student -> weakest/root-cause skills + uncompleted remedial items.
 */
export async function getRemedialRecommendations(opts: {
  skillId?: string;
  studentId?: string;
  limit?: number;
}) {
  const limit = Math.min(20, Math.max(1, opts.limit || 8));
  const nowMs = Date.now();

  if (opts.studentId) {
    const student = await prisma.user.findUnique({
      where: { id: opts.studentId },
      select: { id: true, fullName: true, nickname: true, email: true },
    });
    if (!student) return null;

    const states = await getSkillStates(opts.studentId);
    const evaluated = states.filter((s) => s.evidenceCount > 0);
    const weakSorted = [...evaluated]
      .filter((s) => s.mastery < 0.7 || s.dueForReview)
      .sort((a, b) => a.mastery - b.mastery);
    const topWeak = (weakSorted.length ? weakSorted : [...evaluated].sort((a, b) => a.mastery - b.mastery)).slice(0, 3);

    const primaryIds = topWeak.map((s) => s.skillId);
    const prereqIds: string[] = [];
    for (const s of topWeak) {
      for (const anc of getPrerequisiteAncestors(s.skillId, 2)) {
        if (!primaryIds.includes(anc) && !prereqIds.includes(anc)) prereqIds.push(anc);
      }
    }

    const [solvedSubs, passedQuizzes, doneLessons] = await Promise.all([
      prisma.problemSubmission.findMany({
        where: { studentId: opts.studentId, passed: true },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
      prisma.quizAttempt.findMany({
        where: { userId: opts.studentId, passed: true },
        select: { quizId: true },
        distinct: ["quizId"],
      }),
      prisma.lessonProgress.findMany({
        where: { userId: opts.studentId },
        select: { lessonId: true },
      }),
    ]);

    const exclude = {
      problems: new Set(solvedSubs.map((s) => s.problemId)),
      quizzes: new Set(passedQuizzes.map((q) => q.quizId)),
      lessons: new Set(doneLessons.map((l) => l.lessonId)),
    };

    const suggestedItems = await findRemedialItemsForSkills(primaryIds, prereqIds, exclude, limit);
    return {
      mode: "student" as const,
      student,
      weakSkills: topWeak.map((s) => ({
        skillId: s.skillId,
        name: s.name,
        mastery: s.mastery,
        dueForReview: !!s.dueForReview,
      })),
      suggestedStudents: [
        {
          ...student,
          mastery: topWeak[0]?.mastery ?? 0,
          dueForReview: topWeak.some((w) => !!w.dueForReview),
        },
      ],
      suggestedItems,
      suggestedTitle: topWeak[0]
        ? `Ôn tập: ${topWeak[0].name} — ${student.nickname || student.fullName}`
        : `Luyện tập bổ sung — ${student.nickname || student.fullName}`,
    };
  }

  if (opts.skillId) {
    const skillMeta = SKILL_SEEDS.find((s) => s.skillId === opts.skillId);
    const prereqIds = getPrerequisiteAncestors(opts.skillId, 2);

    const masteryRows = await prisma.studentSkillMastery.findMany({
      where: {
        skillId: opts.skillId,
        user: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
      },
      include: {
        user: { select: { id: true, fullName: true, nickname: true, email: true } },
      },
    });

    const struggling = masteryRows
      .map((r) => {
        const dec = evaluateStoredMasteryRow(r.value, r.historyJson, nowMs);
        if (!dec) return null;
        return {
          id: r.user.id,
          fullName: r.user.fullName,
          nickname: r.user.nickname,
          email: r.user.email,
          mastery: dec.effectiveMastery,
          dueForReview: dec.dueForReview,
        };
      })
      .filter((s): s is NonNullable<typeof s> => !!s && (s.mastery < 0.7 || s.dueForReview))
      .sort((a, b) => a.mastery - b.mastery);

    const suggestedItems = await findRemedialItemsForSkills([opts.skillId], prereqIds, undefined, limit);
    const skillName = skillMeta?.name ?? skillIdToName(opts.skillId);

    return {
      mode: "skill" as const,
      skill: {
        skillId: opts.skillId,
        name: skillName,
        topicName: skillIdToTopic(opts.skillId),
      },
      prerequisiteSkills: prereqIds.map((id) => ({ skillId: id, name: skillIdToName(id) })),
      suggestedStudents: struggling,
      suggestedItems,
      suggestedTitle: `Củng cố kỹ năng: ${skillName}`,
    };
  }

  // Class-wide weak skills summary
  const allMasteries = await prisma.studentSkillMastery.findMany({
    where: {
      user: { role: "student", status: "active", studentRosterExclusions: { none: {} } },
    },
    select: { skillId: true, userId: true, value: true, historyJson: true },
  });

  const observations: DecayedSkillObservation[] = [];
  for (const r of allMasteries) {
    const dec = evaluateStoredMasteryRow(r.value, r.historyJson, nowMs);
    if (!dec) continue;
    observations.push({
      skillId: r.skillId,
      userId: r.userId,
      decayedMastery: dec.effectiveMastery,
      dueForReview: dec.dueForReview,
    });
  }

  return {
    mode: "overview" as const,
    weakClassSkills: rankWeakSkillsForRemediation(observations, 12),
  };
}
