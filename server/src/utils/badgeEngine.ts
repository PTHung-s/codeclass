import prisma from "./prisma";
import { vnStartOfDay } from "./vnTime";
import { notifyNotificationChanged } from "../services/notificationEvents";

// Badge definitions (seeded on first use)
const BADGE_DEFS = [
  { name: "First Blood", description: "Nộp bài đầu tiên", icon: "⚡", category: "milestone" },
  { name: "7-Day Streak", description: "Duy trì streak 7 ngày liên tiếp", icon: "🔥", category: "streak" },
  { name: "Top 10", description: "Lọt top 10 bảng xếp hạng", icon: "🏆", category: "achievement" },
  { name: "Scholar", description: "Hoàn thành 10 bài học", icon: "📚", category: "milestone" },
  { name: "Perfect Score", description: "AC 5 bài liên tiếp", icon: "💯", category: "skill" },
  { name: "Sharpshooter", description: "AC bài Khó đầu tiên", icon: "🎯", category: "skill" },
  { name: "Grandmaster", description: "Đạt level Grandmaster", icon: "⚡", category: "achievement" },
  { name: "Speed Demon", description: "Giải 10 bài trong 1 ngày", icon: "🚀", category: "milestone" },
  { name: "30-Day Veteran", description: "Streak 30 ngày", icon: "👑", category: "streak" },
  { name: "Problem Solver", description: "Giải 50 bài tập", icon: "🧩", category: "milestone" },
];

/** Seed badge definitions if not already present */
async function ensureBadges() {
  for (const def of BADGE_DEFS) {
    await prisma.badge.upsert({
      where: { id: def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
      update: {},
      create: {
        id: def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
      },
    });
  }
}

/** Award a badge if user doesn't already have it */
async function awardBadge(userId: string, badgeName: string) {
  const badgeId = badgeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId } },
  });
  if (existing) return false;

  await prisma.userBadge.create({
    data: { userId, badgeId },
  });

  // Create notification
  const badge = await prisma.badge.findUnique({ where: { id: badgeId } });
  if (badge) {
    await prisma.notification.create({
      data: {
        userId,
        title: "🏆 Huy hiệu mới!",
        message: `Bạn vừa nhận huy hiệu "${badge.name}" — ${badge.description}`,
        type: "achievement",
        relatedEntityType: "badge",
        relatedEntityId: badgeId,
      },
    });
    notifyNotificationChanged(userId);
  }
  return true;
}

/** Check and award all applicable badges for a user */
export async function checkBadges(userId: string) {
  await ensureBadges();

  // ── Problem Submissions ──
  const submissions = await prisma.problemSubmission.findMany({
    where: { studentId: userId },
    orderBy: { createdAt: "asc" },
  });
  const distinctProblemIds = [...new Set(submissions.map((s) => s.problemId))];

  // First Blood — first submission ever
  if (submissions.length >= 1) {
    await awardBadge(userId, "First Blood");
  }

  // Problem Solver — 50 distinct problems
  if (distinctProblemIds.length >= 50) {
    await awardBadge(userId, "Problem Solver");
  }

  // Perfect Score — AC 5 in a row
  let bestAcStreak = 0;
  let currentAcStreak = 0;
  const orderedSubs = submissions.filter((s) => s.note);
  for (const sub of orderedSubs) {
    const match = sub.note?.match(/Auto-judge \((\d+)\/(\d+)\)/);
    if (match && parseInt(match[1]) === parseInt(match[2])) {
      currentAcStreak++;
      if (currentAcStreak > bestAcStreak) bestAcStreak = currentAcStreak;
    } else {
      currentAcStreak = 0;
    }
  }
  if (bestAcStreak >= 5) {
    await awardBadge(userId, "Perfect Score");
  }

  // Sharpshooter — AC a Hard problem
  const acProblems = new Set<string>();
  for (const sub of submissions) {
    const match = sub.note?.match(/Auto-judge \((\d+)\/(\d+)\)/);
    if (match && parseInt(match[1]) === parseInt(match[2])) {
      acProblems.add(sub.problemId);
    }
  }
  const hardProblems = await prisma.problem.findMany({
    where: { id: { in: [...acProblems] }, difficulty: "hard" },
    select: { id: true },
  });
  if (hardProblems.length > 0) {
    await awardBadge(userId, "Sharpshooter");
  }

  // Speed Demon — 10 problems in one day (VN day, not the host's UTC day:
  // otherwise the window runs 17:00–17:00 VN and splits an evening session).
  const today = vnStartOfDay();
  const todaySubs = submissions.filter((s) => s.createdAt >= today);
  if (todaySubs.length >= 10) {
    await awardBadge(userId, "Speed Demon");
  }

  // ── Streak ──
  const allSubDates = submissions.map((s) => s.createdAt);
  if (allSubDates.length > 0) {
    const df = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const keys = [...new Set(allSubDates.map((d) => df.format(d)))].sort();
    let streak = 1;
    for (let i = keys.length - 1; i > 0; i--) {
      const d1 = new Date(`${keys[i - 1]}T00:00:00+07:00`);
      const d2 = new Date(`${keys[i]}T00:00:00+07:00`);
      if (Math.round((d2.getTime() - d1.getTime()) / 86400000) === 1) streak++;
      else break;
    }
    if (streak >= 7) await awardBadge(userId, "7-Day Streak");
    if (streak >= 30) await awardBadge(userId, "30-Day Veteran");
  }

  // ── Lessons ──
  const lessonCount = await prisma.lessonProgress.count({ where: { userId } });
  if (lessonCount >= 10) {
    await awardBadge(userId, "Scholar");
  }

  // ── Leaderboard Rank ── (check Top 10) + Grandmaster
  const users = await prisma.user.findMany({
    where: { role: "student", status: "active" },
    select: { id: true, xp: true },
  });
  const rankings: { id: string; xp: number }[] = users.map((u) => ({ id: u.id, xp: u.xp }));
  rankings.sort((a, b) => b.xp - a.xp);
  const rank = rankings.findIndex((r) => r.id === userId) + 1;
  if (rank > 0 && rank <= 10) {
    await awardBadge(userId, "Top 10");
  }

  // ── Grandmaster ──
  const level = Math.floor(Math.sqrt(Math.max(0, rankings.find((r) => r.id === userId)?.xp || 0) / 10)) + 1;
  if (level >= 31) {
    await awardBadge(userId, "Grandmaster");
  }
}
