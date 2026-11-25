import prisma from "../utils/prisma";

const MAX_DAILY_ITEMS = 3;
const WEAK_MASTERY_THRESHOLD = 0.7;
const RECENT_WINDOW_DAYS = 30;

type EligibleContent = {
  lessonId: string;
  lessonTitle: string;
  quizId: string | null;
  problemIds: string[];
};

type SkillEvidence = {
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
  const existing = current.find((entry) => entry.lessonId === content.lessonId);
  if (existing) {
    if (!existing.quizId && content.quizId) existing.quizId = content.quizId;
    existing.problemIds = [...new Set([...existing.problemIds, ...content.problemIds])];
  } else {
    current.push(content);
  }
  map.set(skillId, current);
}

function recordEvidence(
  evidence: Map<string, SkillEvidence>,
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

function safeAnswers(value: string): Array<{ questionId?: string; isCorrect?: boolean }> {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function daysSince(date: Date | null, now: Date): number {
  if (!date) return RECENT_WINDOW_DAYS;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

export async function createTodayDailyStudyPlan(userId: string) {
  const dateKey = vietnamDateKey();
  const existing = await getTodayDailyStudyPlan(userId);
  if (existing) return existing;

  // The curriculum boundary comes exclusively from completed lessons.
  const completed = await prisma.lessonProgress.findMany({
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
  });

  const eligibleBySkill = new Map<string, EligibleContent[]>();
  const questionSkill = new Map<string, string>();
  const problemSkill = new Map<string, string>();
  const problemDetails = new Map<
    string,
    { id: string; title: string; estimatedTime: number | null }
  >();

  for (const progress of completed) {
    const lesson = progress.lesson;
    for (const quiz of lesson.quizzes) {
      for (const question of quiz.questions) {
        if (!question.skillId) continue;
        questionSkill.set(question.id, question.skillId);
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
      problemSkill.set(problem.id, problem.skillId);
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

  const eligibleSkillIds = [...eligibleBySkill.keys()];
  if (eligibleSkillIds.length === 0) {
    return prisma.dailyStudyPlan.create({
      data: { userId, day: dateKey, status: "empty", estimatedMinutes: 0 },
      include: planInclude,
    });
  }

  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000);
  const relevantQuizIds = new Set(
    [...eligibleBySkill.values()].flat().flatMap((content) =>
      content.quizId ? [content.quizId] : [],
    ),
  );
  const relevantProblemIds = [...problemSkill.keys()];

  const [masteries, quizAttempts, problemSubmissions] = await Promise.all([
    prisma.studentSkillMastery.findMany({
      where: { userId, skillId: { in: eligibleSkillIds } },
      include: { skill: { select: { name: true } } },
    }),
    relevantQuizIds.size > 0
      ? prisma.quizAttempt.findMany({
          where: {
            userId,
            quizId: { in: [...relevantQuizIds] },
            createdAt: { gte: recentSince },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    relevantProblemIds.length > 0
      ? prisma.problemSubmission.findMany({
          where: {
            studentId: userId,
            problemId: { in: relevantProblemIds },
            createdAt: { gte: recentSince },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const evidence = new Map<string, SkillEvidence>();
  for (const attempt of quizAttempts) {
    for (const answer of safeAnswers(attempt.answers)) {
      if (!answer.questionId) continue;
      const skillId = questionSkill.get(answer.questionId);
      if (skillId) recordEvidence(evidence, skillId, Boolean(answer.isCorrect), attempt.createdAt);
    }
  }

  const lastProblemPassed = new Map<string, boolean>();
  for (const submission of problemSubmissions) {
    const skillId = problemSkill.get(submission.problemId);
    if (skillId) recordEvidence(evidence, skillId, submission.passed, submission.createdAt);
    lastProblemPassed.set(submission.problemId, submission.passed);
  }

  const now = new Date();
  const candidates = masteries
    .filter((mastery) => mastery.value < WEAK_MASTERY_THRESHOLD || mastery.trend === "down")
    .map((mastery) => {
      const stats = evidence.get(mastery.skillId) || { total: 0, wrong: 0, lastSeenAt: null };
      const masteryGap = 1 - mastery.value;
      const wrongRate = stats.total > 0 ? stats.wrong / stats.total : masteryGap;
      const dueScore = Math.min(1, daysSince(stats.lastSeenAt, now) / 14);
      const trendScore = mastery.trend === "down" ? 1 : 0;
      const confidence = Math.min(1, stats.total / 5);
      const priority =
        0.45 * masteryGap +
        0.25 * wrongRate +
        0.15 * dueScore +
        0.1 * trendScore +
        0.05 * confidence;
      return { mastery, stats, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_DAILY_ITEMS);

  const items = candidates.map((candidate, index) => {
    const { mastery, stats } = candidate;
    const contents = eligibleBySkill.get(mastery.skillId) || [];
    const content = contents[0];
    const preferredProblemId = contents
      .flatMap((entry) => entry.problemIds)
      .find((problemId) => lastProblemPassed.get(problemId) !== true);
    const fallbackProblemId = contents.flatMap((entry) => entry.problemIds)[0];
    const problemId = preferredProblemId || fallbackProblemId || null;
    const problem = problemId ? problemDetails.get(problemId) : null;
    const quizContent = contents.find((entry) => entry.quizId);

    let itemType = "lesson";
    let title = `Ôn lại: ${content.lessonTitle}`;
    let actionUrl = `/lessons/${content.lessonId}`;
    let estimatedMinutes = 6;
    let quizId: string | null = null;

    if (problem) {
      itemType = "problem";
      title = `Luyện lại: ${problem.title}`;
      actionUrl = `/problems/${problem.id}`;
      estimatedMinutes = Math.max(5, Math.min(20, problem.estimatedTime || 10));
    } else if (quizContent?.quizId) {
      itemType = "quiz";
      quizId = quizContent.quizId;
      title = `Kiểm tra lại: ${quizContent.lessonTitle}`;
      actionUrl = `/lessons/${quizContent.lessonId}/quiz`;
      estimatedMinutes = 5;
    }

    const masteryPercent = Math.round(mastery.value * 100);
    const evidenceText =
      stats.total > 0
        ? `${stats.wrong}/${stats.total} lượt chưa đúng trong ${RECENT_WINDOW_DAYS} ngày; mastery ${masteryPercent}%`
        : `Mastery ${masteryPercent}%; cần củng cố lại kiến thức đã học`;

    return {
      userId,
      day: dateKey,
      type: itemType,
      itemType,
      status: "pending",
      skillId: mastery.skillId,
      lessonId: content.lessonId,
      quizId,
      problemId,
      evidence: evidenceText,
      actionUrl,
      title,
      reason: `Kỹ năng “${mastery.skill.name}” đang ở mức ${masteryPercent}%.`,
      position: index,
      priority: Math.round(candidate.priority * 10_000) / 10_000,
      masterySnapshot: mastery.value,
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
    // Another request may have created the same unique daily plan concurrently.
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
