import prisma from "./prisma";
import { vnDayKey, vnStartOfDay, vnStartOfNextWeek, vnStartOfWeek, vnWeekKey } from "./vnTime";

// ── Period helpers ──
// All VN-calendar maths lives in vnTime.ts. Doing it here with getDay()/setDate()
// silently shifted every week to Tuesday, because the container runs in UTC and
// VN midnight is 17:00 UTC the previous day.

export function dailyKey(d = new Date()): string {
  return vnDayKey(d);
}

export function weeklyKey(d = new Date()): string {
  return vnWeekKey(d);
}

export function periodStart(type: string): Date | null {
  const now = new Date();
  if (type === "daily") return vnStartOfDay(now);
  if (type === "weekly") return vnStartOfWeek(now);
  return null; // achievement = all-time
}

export function periodKeyFor(type: string): string {
  if (type === "daily") return dailyKey();
  if (type === "weekly") return weeklyKey();
  return "ever";
}

export function nextReset(type: string): Date | null {
  const now = new Date();
  if (type === "daily") return new Date(vnStartOfDay(now).getTime() + 86400000);
  if (type === "weekly") return vnStartOfNextWeek(now);
  return null;
}

// ── Metric computation ──

async function computeMetric(userId: string, metric: string, since: Date | null): Promise<number> {
  const dateFilter = since ? { gte: since } : undefined;

  switch (metric) {
    case "problems_solved":
      return prisma.problemSubmission.count({
        where: { studentId: userId, passed: true, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      });

    case "lessons_completed":
      return prisma.lessonProgress.count({
        where: { userId, ...(dateFilter ? { completedAt: dateFilter } : {}) },
      });

    case "assignments_submitted":
      return prisma.submission.count({
        where: { studentId: userId, ...(dateFilter ? { submittedAt: dateFilter } : {}) },
      });

    case "quizzes_passed":
      return prisma.quizAttempt.count({
        where: { userId, passed: true, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      });

    case "daily_claim":
      return prisma.tokenTransaction.count({
        where: { userId, reason: "daily_claim", ...(dateFilter ? { createdAt: dateFilter } : {}) },
      });

    case "current_streak": {
      const { getStreak } = await import("./xpLedger");
      return getStreak(userId);
    }

    case "current_level": {
      const { getUserXp } = await import("./xpLedger");
      const userXp = await getUserXp(userId);
      return Math.floor(Math.sqrt(Math.max(0, userXp) / 10)) + 1;
    }

    case "total_problems": {
      return prisma.problemSubmission.findMany({
        where: { studentId: userId, passed: true },
        select: { problemId: true },
        distinct: ["problemId"],
      }).then((r) => r.length);
    }

    // ── Chống rush: phải học đủ thời lượng, không phải mở tab rồi bỏ ──
    case "study_minutes": {
      const logs = await prisma.sessionLog.findMany({
        where: { userId, ...(dateFilter ? { date: dateFilter } : {}) },
        select: { activeSeconds: true },
      });
      return Math.floor(logs.reduce((s, l) => s + l.activeSeconds, 0) / 60);
    }

    // ── Chống nộp lại tới khi đúng: chỉ tính bài ĐỖ NGAY lần chạy đầu ──
    case "first_pass_solved": {
      return prisma.challengeAttempt.count({
        where: {
          userId,
          firstPassCode: { not: null },
          ...(dateFilter ? { firstPassAt: dateFilter } : {}),
        },
      });
    }

    default:
      return 0;
  }
}

// ── Quest resolution ──

export interface ResolvedQuest {
  id: string;
  title: string;
  description: string | null;
  type: string;
  metric: string;
  target: number;
  tokenReward: number;
  icon: string | null;
  current: number;
  completed: boolean;
  claimed: boolean;
  periodKey: string;
  eventId: string | null;
}

export interface ResolvedEvent {
  id: string;
  name: string;
  subtitle: string | null;
  icon: string;
  theme: string;
  startsAt: string;
  endsAt: string | null;
  quests: ResolvedQuest[];
}

export interface ResolvedQuests {
  daily: ResolvedQuest[];
  weekly: ResolvedQuest[];
  achievement: ResolvedQuest[];
  events: ResolvedEvent[];
}

export async function resolveQuests(userId: string): Promise<ResolvedQuests> {
  const [quests, events] = await Promise.all([
    prisma.quest.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: { event: true },
    }),
    prisma.gameEvent.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { quests: { where: { isActive: true } } },
    }),
  ]);

  const result: ResolvedQuest[] = [];

  for (const quest of quests) {
    // Quest thuộc event → periodKey theo event (claim 1 lần/sự kiện); ngược lại theo type
    const pk = quest.eventId ? `event:${quest.eventId}` : periodKeyFor(quest.type);
    const since = quest.eventId ? null : periodStart(quest.type);
    const current = Math.min(await computeMetric(userId, quest.metric, since), quest.target);

    // Check if already claimed this period
    const progress = await prisma.questProgress.findUnique({
      where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: pk } },
    });

    result.push({
      id: quest.id,
      title: quest.title,
      description: quest.description,
      type: quest.type,
      metric: quest.metric,
      target: quest.target,
      tokenReward: quest.tokenReward,
      icon: quest.icon,
      current,
      completed: current >= quest.target,
      claimed: progress?.claimed ?? false,
      periodKey: pk,
      eventId: quest.eventId,
    });
  }

  // Nhóm theo event, chỉ đưa event đang hoạt động (chưa hết hạn theo endsAt)
  const now = new Date();
  const eventQuests: ResolvedEvent[] = [];
  for (const event of events) {
    if (event.endsAt && new Date(event.endsAt).getTime() < now.getTime()) continue; // đã kết thúc
    const qs = result.filter((q) => q.eventId === event.id);
    if (qs.length === 0) continue;
    eventQuests.push({
      id: event.id,
      name: event.name,
      subtitle: event.subtitle,
      icon: event.icon,
      theme: event.theme,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      quests: qs,
    });
  }

  return {
    daily: result.filter((q) => q.type === "daily"),
    weekly: result.filter((q) => q.type === "weekly"),
    achievement: result.filter((q) => q.type === "achievement"),
    events: eventQuests,
  };
}

export async function claimQuest(userId: string, questId: string): Promise<{ success: boolean; tokenReward: number; message: string }> {
  const quest = await prisma.quest.findUnique({ where: { id: questId } });
  if (!quest || !quest.isActive) {
    return { success: false, tokenReward: 0, message: "Nhiệm vụ không tồn tại" };
  }

  const pk = quest.eventId ? `event:${quest.eventId}` : periodKeyFor(quest.type);
  const since = quest.eventId ? null : periodStart(quest.type);

  // Verify progress meets target
  const current = await computeMetric(userId, quest.metric, since);
  if (current < quest.target) {
    return { success: false, tokenReward: 0, message: "Chưa hoàn thành nhiệm vụ" };
  }

  // Atomic claim: only update if not already claimed
  const existing = await prisma.questProgress.findUnique({
    where: { userId_questId_periodKey: { userId, questId, periodKey: pk } },
  });

  if (existing?.claimed) {
    return { success: false, tokenReward: 0, message: "Đã nhận thưởng rồi" };
  }

  // Upsert progress as claimed
  await prisma.questProgress.upsert({
    where: { userId_questId_periodKey: { userId, questId, periodKey: pk } },
    create: { userId, questId, current, claimed: true, claimedAt: new Date(), periodKey: pk },
    update: { current, claimed: true, claimedAt: new Date() },
  });

  // Award tokens
  const { awardTokens } = await import("./tokens");
  await awardTokens(userId, quest.tokenReward, {
    reason: "quest_claim",
    description: `Nhiệm vụ: ${quest.title}`,
    refType: "QuestClaim",
    refId: `${questId}_${pk}`,
  });

  return { success: true, tokenReward: quest.tokenReward, message: "Nhận thưởng thành công!" };
}
