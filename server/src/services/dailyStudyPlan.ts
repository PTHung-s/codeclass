import prisma from "../utils/prisma";
import { getSkillStates } from "./skillMastery";
import { getSkillDependents } from "../utils/skillGraph";

const MAX_DAILY_ITEMS = 3;
const WEAK_MASTERY_THRESHOLD = 0.7;
const RECENT_WINDOW_DAYS = 30;

type EligibleContent = {
  lessonId: string | null;
  lessonTitle: string;
  quizId: string | null;
  problemIds: string[];
};

type SkillEvidenceStat = {
  total: number;
  wrong: number;
  lastSeenAt: Date | null;
};

export function vietnamDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const planInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: { skill: { select: { name: true, topicName: true } } },
  },
};

export async function getTodayDailyStudyPlan(userId: string) {
  return prisma.dailyStudyPlan.findUnique({
    where: { userId_day: { userId, day: vietnamDateKey() } },
    include: planInclude,
  });
}

function addEligibleContent(
  map: Map<string, EligibleContent[]>,
  skillId: string,
  content: EligibleContent,
) {
  const current = map.get(skillId) || [];
  const existing = current.find((entry) => entry.lessonId === content.lessonId && entry.quizId === content.quizId);
  if (existing) {
    existing.problemIds = [...new Set([...existing.problemIds, ...content.problemIds])];
  } else {
    current.push(content);
  }
  map.set(skillId, current);
}

function recordEvidenceStat(
  evidence: Map<string, SkillEvidenceStat>,
  skillId: string,
  isCorrect: boolean,
  seenAt: Date,
) {
  const current = evidence.get(skillId) || { total: 0, wrong: 0, lastSeenAt: null };
  current.total += 1;
  if (!isCorrect) current.wrong += 1;
  if (!current.lastSeenAt || seenAt > current.lastSeenAt) current.lastSeenAt = seenAt;
  evidence.set(skillId, current);
}

export async function createTodayDailyStudyPlan(userId: string) {
  const dateKey = vietnamDateKey();
  const existing = await getTodayDailyStudyPlan(userId);
  if (existing) return existing;

  const [completed, skillStates] = await Promise.all([
    prisma.lessonProgress.findMany({
      where: { userId },
      include: {
        lesson: {
          include: {
            quizzes: {
              include: {
                questions: {
                  where: { skillTagStatus: "approved", skillId: { not: null } },
                  select: { id: true, skillId: true },
                },
              },
            },
            assignments: {
              include: {
                problem: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    skillId: true,
                    skillTagStatus: true,
                    estimatedTime: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getSkillStates(userId),
  ]);

  const eligibleBySkill = new Map<string, EligibleContent[]>();
  const problemDetails = new Map<
    string,
    { id: string; title: string; estimatedTime: number | null }
  >();

  for (const progress of completed) {
    const lesson = progress.lesson;
    for (const quiz of lesson.quizzes) {
      for (const question of quiz.questions) {
        if (!question.skillId) continue;
        addEligibleContent(eligibleBySkill, question.skillId, {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          quizId: quiz.id,
          problemIds: [],
        });
      }
    }

    for (const assignment of lesson.assignments) {
      const problem = assignment.problem;
      if (
        !problem ||
        assignment.status === "draft" ||
        problem.status === "draft" ||
        problem.skillTagStatus !== "approved" ||
        !problem.skillId
      ) {
        continue;
      }
      problemDetails.set(problem.id, {
        id: problem.id,
        title: problem.title,
        estimatedTime: problem.estimatedTime,
      });
      addEligibleContent(eligibleBySkill, problem.skillId, {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        quizId: null,
        problemIds: [problem.id],
      });
    }
  }

  // Also load unified evidence across ALL 8 sources over the last 30 days
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000);
  const [recentEvidence, passedProblems] = await Promise.all([
    prisma.skillEvidence.findMany({
      where: { userId, occurredAt: { gte: recentSince } },
      orderBy: { occurredAt: "asc" },
      select: { skillId: true, isCorrect: true, occurredAt: true },
    }),
    prisma.problemSubmission.findMany({
      where: { studentId: userId, passed: true },
      distinct: ["problemId"],
      select: { problemId: true },
    }),
  ]);

  const evidenceStats = new Map<string, SkillEvidenceStat>();
  for (const row of recentEvidence) {
    recordEvidenceStat(evidenceStats, row.skillId, row.isCorrect, row.occurredAt);
  }
  const solvedProblemIds = new Set(passedProblems.map((p) => p.problemId));

  // Include evidenced skills that came from Exams / SessionCourses / Challenges
  // even if their LessonProgress isn't in completed lessons yet: find published problems/quizzes for them.
  const evidencedSkillIds = skillStates.filter((s) => s.hasEvidence).map((s) => s.skillId);
  const missingContentSkills = evidencedSkillIds.filter((sid) => !eligibleBySkill.has(sid));

  if (missingContentSkills.length > 0) {
    const [fallbackProblems, fallbackQuestions] = await Promise.all([
      prisma.problem.findMany({
        where: { status: "published", skillTagStatus: "approved", skillId: { in: missingContentSkills } },
        select: { id: true, title: true, estimatedTime: true, skillId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quizQuestion.findMany({
        where: { skillTagStatus: "approved", skillId: { in: missingContentSkills } },
        select: {
          skillId: true,
          quiz: { select: { id: true, lessonId: true, lesson: { select: { title: true } } } },
        },
      }),
    ]);

    for (const p of fallbackProblems) {
      if (!p.skillId) continue;
      problemDetails.set(p.id, { id: p.id, title: p.title, estimatedTime: p.estimatedTime });
      addEligibleContent(eligibleBySkill, p.skillId, {
        lessonId: null,
        lessonTitle: p.title,
        quizId: null,
        problemIds: [p.id],
      });
    }
    for (const q of fallbackQuestions) {
      if (!q.skillId || !q.quiz?.lessonId) continue;
      addEligibleContent(eligibleBySkill, q.skillId, {
        lessonId: q.quiz.lessonId,
        lessonTitle: q.quiz.lesson?.title || "Bài học liên quan",
        quizId: q.quiz.id,
        problemIds: [],
      });
    }
  }

  const weakOrEvidencedSet = new Set(
    skillStates
      .filter((s) => s.hasEvidence && (s.mastery < WEAK_MASTERY_THRESHOLD || s.trend === "down" || s.dueForReview))
      .map((s) => s.skillId),
  );

  const candidates = skillStates
    .filter((s) => weakOrEvidencedSet.has(s.skillId) && eligibleBySkill.has(s.skillId))
    .map((state) => {
      const stats = evidenceStats.get(state.skillId) || { total: 0, wrong: 0, lastSeenAt: null };
      const masteryGap = 1 - state.mastery;
      const wrongRate = stats.total > 0 ? stats.wrong / stats.total : masteryGap;
      const forgettingUrgency = 1 - (state.retentionRate ?? 1);
      const trendScore = state.trend === "down" ? 1 : 0;
      const isBlockingPrereq = getSkillDependents(state.skillId).some((dep) => weakOrEvidencedSet.has(dep));
      const prereqBonus = isBlockingPrereq ? 1 : 0;

      const priority =
        0.40 * masteryGap +
        0.20 * wrongRate +
        0.20 * forgettingUrgency +
        0.10 * trendScore +
        0.10 * prereqBonus;

      return { state, stats, isBlockingPrereq, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_DAILY_ITEMS);

  if (candidates.length === 0) {
    return prisma.dailyStudyPlan.create({
      data: { userId, day: dateKey, status: "empty", estimatedMinutes: 0 },
      include: planInclude,
    });
  }

  const items = candidates.map((candidate, index) => {
    const { state, stats, isBlockingPrereq } = candidate;
    const contents = eligibleBySkill.get(state.skillId) || [];
    const content = contents[0];
    const preferredProblemId = contents
      .flatMap((entry) => entry.problemIds)
      .find((problemId) => !solvedProblemIds.has(problemId));
    const fallbackProblemId = contents.flatMap((entry) => entry.problemIds)[0];
    const problemId = preferredProblemId || fallbackProblemId || null;
    const problem = problemId ? problemDetails.get(problemId) : null;
    const quizContent = contents.find((entry) => entry.quizId);

    let itemType = "lesson";
    let title = `Ôn lại: ${content.lessonTitle}`;
    let actionUrl = content.lessonId ? `/lessons/${content.lessonId}` : "/problems";
    let estimatedMinutes = 6;
    let quizId: string | null = null;

    if (problem) {
      itemType = "problem";
      title = `Luyện lại: ${problem.title}`;
      actionUrl = `/problems/${problem.id}`;
      estimatedMinutes = Math.max(5, Math.min(20, problem.estimatedTime || 10));
    } else if (quizContent?.quizId && quizContent.lessonId) {
      itemType = "quiz";
      quizId = quizContent.quizId;
      title = `Kiểm tra lại: ${quizContent.lessonTitle}`;
      actionUrl = `/lessons/${quizContent.lessonId}/quiz`;
      estimatedMinutes = 5;
    }

    const masteryPercent = Math.round(state.mastery * 100);
    const daysIdle = Math.round(state.daysSinceLastPractice ?? 0);
    const reasonParts = [`Kỹ năng “${state.name}” hiện ở mức ${masteryPercent}%`];
    if (state.dueForReview && daysIdle > 0) {
      reasonParts.push(`đã ${daysIdle} ngày chưa ôn`);
    }
    if (isBlockingPrereq) {
      reasonParts.push("là nền tảng cho kỹ năng tiếp theo");
    }

    const evidenceText =
      stats.total > 0
        ? `${stats.wrong}/${stats.total} lượt chưa đúng trong ${RECENT_WINDOW_DAYS} ngày · mastery ${masteryPercent}%`
        : state.dueForReview
          ? `Lưu giữ còn ${Math.round((state.retentionRate ?? 1) * 100)}% sau ${daysIdle} ngày · mastery ${masteryPercent}%`
          : `Mastery ${masteryPercent}%; cần củng cố lại kiến thức đã học`;

    return {
      userId,
      day: dateKey,
      type: itemType,
      itemType,
      status: "pending",
      skillId: state.skillId,
      lessonId: content.lessonId,
      quizId,
      problemId,
      evidence: evidenceText,
      actionUrl,
      title,
      reason: `${reasonParts.join(" — ")}.`,
      position: index,
      priority: Math.round(candidate.priority * 10_000) / 10_000,
      masterySnapshot: state.mastery,
      estimatedMinutes,
    };
  });

  const estimatedMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  try {
    return await prisma.dailyStudyPlan.create({
      data: {
        userId,
        day: dateKey,
        status: items.length > 0 ? "pending" : "empty",
        estimatedMinutes,
        items: { create: items },
      },
      include: planInclude,
    });
  } catch (error: any) {
    if (error?.code === "P2002") return getTodayDailyStudyPlan(userId);
    throw error;
  }
}

export async function completeDailyStudyItem(userId: string, itemId: string) {
  const item = await prisma.dailyStudyItem.findUnique({
    where: { id: itemId },
    include: { plan: { select: { id: true, userId: true } } },
  });
  if (!item || !item.plan || item.plan.userId !== userId) {
    throw new Error("Không tìm thấy mục ôn tập.");
  }
  const planId = item.planId ?? item.plan.id;

  if (item.status !== "completed") {
    await prisma.dailyStudyItem.update({
      where: { id: itemId },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  const remaining = await prisma.dailyStudyItem.count({
    where: { planId, status: "pending" },
  });
  await prisma.dailyStudyPlan.update({
    where: { id: planId },
    data:
      remaining === 0
        ? { status: "completed", completedAt: new Date() }
        : { status: "in_progress" },
  });

  return prisma.dailyStudyPlan.findUnique({
    where: { id: planId },
    include: planInclude,
  });
}
