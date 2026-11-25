import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { vnStartOfDay, vnStartOfMonth, vnStartOfWeek } from "../utils/vnTime";
import { getStreakByUser } from "../utils/xpLedger";
import { awardTokens } from "../utils/tokens";

const router = Router();

// ── Shared XP → Level logic (mirrors client/src/lib/levels.ts) ──

function getLevelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1;
}

function getXpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 10;
}

interface LevelInfo {
  level: number;
  league: string;
  leagueEmoji: string;
  levelTitle: string;
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpToNextLevel: number;
  levelProgress: number;
}

const ROMAN = ["V", "IV", "III", "II", "I"];

function getLevelInfo(xp: number): LevelInfo {
  const level = getLevelFromXp(xp);
  const LEAGUES = [
    { name: "Bronze", emoji: "🥉", min: 1, max: 5 },
    { name: "Silver", emoji: "🥈", min: 6, max: 10 },
    { name: "Gold", emoji: "🥇", min: 11, max: 15 },
    { name: "Platinum", emoji: "💎", min: 16, max: 20 },
    { name: "Diamond", emoji: "💠", min: 21, max: 25 },
    { name: "Master", emoji: "👑", min: 26, max: 30 },
    { name: "Grandmaster", emoji: "⚡", min: 31, max: Infinity },
  ];
  const ldef = LEAGUES.find((l) => level >= l.min && level <= l.max)!;
  const tierIdx = level - ldef.min; // 0..4
  const subTier = ROMAN[tierIdx];
  const currentLevelMinXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const xpToNextLevel = nextLevelXp - currentLevelMinXp;
  const levelProgress = xpToNextLevel > 0 ? Math.round(((xp - currentLevelMinXp) / xpToNextLevel) * 100) : 100;

  return {
    level,
    league: ldef.name,
    leagueEmoji: ldef.emoji,
    levelTitle: `${ldef.name} ${subTier}`,
    currentLevelMinXp,
    nextLevelXp,
    xpToNextLevel,
    levelProgress,
  };
}

// ── Time filter helpers ──
// "week"/"month" are calendar periods in VN time, not rolling windows. A rolling
// 7×24h window made "top tuần" drift every hour, so the same student could be
// #1 in the morning and #3 that evening with nothing having changed. A fixed
// Monday start is also what the weekly honour cards and weekly rewards key off.

function getTimeFilter(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "today":
      return vnStartOfDay(now);
    case "week":
      return vnStartOfWeek(now);
    case "month":
      return vnStartOfMonth(now);
    default:
      return null;
  }
}

// ── Snapshot helper ──

async function ensureTodaySnapshot() {
  // VN midnight, not the host's: the container runs in UTC, so setHours(0,0,0,0)
  // stamped snapshots 7 hours early and split one VN day across two keys.
  const today = vnStartOfDay();
  // Full leaderboard from User.xp (ledger totals) plus the recovered streak
  // derived from study/session history. Re-upserting today is intentional: an
  // earlier version stored every streak as 0, and a visitor should not have to
  // wait until tomorrow for the repaired snapshot to become visible.
  const [users, streakByUser, problemCounts] = await Promise.all([
    prisma.user.findMany({
    where: { role: "student", status: "active" },
    select: { id: true, xp: true },
    }),
    import("../utils/xpLedger").then(({ getStreakByUser }) => getStreakByUser()),
    import("../utils/xpLedger").then(({ countXpByUser }) => countXpByUser("Problem")),
  ]);
  const entries = users.map((u) => ({
    userId: u.id,
    xp: u.xp,
    problemCount: problemCounts.get(u.id) ?? 0,
    streak: streakByUser.get(u.id) ?? 0,
  }));
  entries.sort((a, b) => b.xp - a.xp);

  // Save snapshot
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    await prisma.rankSnapshot.upsert({
      where: { userId_date: { userId: e.userId, date: today } },
      create: { userId: e.userId, xp: e.xp, rank: i + 1, streak: e.streak, problemCount: e.problemCount, date: today },
      update: { xp: e.xp, rank: i + 1, streak: e.streak, problemCount: e.problemCount },
    });
  }
}

// ── GET /leaderboard ──
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || "xp";
    const period = (req.query.period as string) || "all";

    // ── Top Tokens ──
    if (type === "tokens") {
      const users = await prisma.user.findMany({
        where: { role: "student", status: "active" },
        select: { id: true, fullName: true, nickname: true, avatarUrl: true, tokenBalance: true },
        orderBy: { tokenBalance: "desc" },
        take: 20,
      });
      const result = users.map((u, i) => ({
        userId: u.id,
        fullName: u.nickname || u.fullName,
        avatarUrl: u.avatarUrl,
        value: u.tokenBalance,
        rank: i + 1,
        reward: i < 10 ? (11 - (i + 1)) * 2 : 0,
      }));
      res.json({ leaderboard: result, type: "tokens" });
      return;
    }

    // ── Top Streak ──
    if (type === "streak") {
      const streakByUser = await getStreakByUser();
      const userIds = [...streakByUser.entries()]
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id]) => id);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, role: "student", status: "active" },
        select: { id: true, fullName: true, nickname: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const result = userIds
        .map((id, i) => {
          const u = userMap.get(id);
          if (!u) return null;
          return {
            userId: u.id,
            fullName: u.nickname || u.fullName,
            avatarUrl: u.avatarUrl,
            value: streakByUser.get(id) ?? 0,
            rank: i + 1,
            reward: i < 10 ? (11 - (i + 1)) * 2 : 0,
          };
        })
        .filter(Boolean);
      res.json({ leaderboard: result, type: "streak" });
      return;
    }

    // Ensure today's snapshot exists
    const timeFilter = getTimeFilter(period);
    await ensureTodaySnapshot();

    // Windowed XP from the ledger (single source of truth). All-time reads
    // User.xp directly; windowed sums the ledger since the period start.
    // Deliberately NOT excluding roster-removed students — that list is an
    // attendance/tuition tool ("Học sinh đã loại", with a Restore button), and
    // on production it holds real, active students alongside the test accounts.
    const xpLedger = await import("../utils/xpLedger");
    const users = await prisma.user.findMany({
      where: { role: "student", status: "active" },
      select: { id: true, fullName: true, nickname: true, avatarUrl: true, xp: true },
    });
    let xpByUser: Map<string, number>;
    let problemCounts = new Map<string, number>();
    let lessonCounts = new Map<string, number>();
    let streakByUser = new Map<string, number>();
    if (period === "all") {
      xpByUser = new Map(users.map((u) => [u.id, u.xp]));
      [problemCounts, lessonCounts, streakByUser] = await Promise.all([
        xpLedger.countXpByUser("Problem"),
        xpLedger.countXpByUser("Lesson"),
        xpLedger.getStreakByUser(),
      ]);
    } else {
      xpByUser = await xpLedger.sumXpInWindow(timeFilter);
      [problemCounts, lessonCounts] = await Promise.all([
        xpLedger.countXpByUser("Problem", timeFilter ?? undefined),
        xpLedger.countXpByUser("Lesson", timeFilter ?? undefined),
      ]);
    }

    const leaderboard = users.map((u) => {
      const xp = xpByUser.get(u.id) ?? 0;
      const levelInfo = getLevelInfo(xp);
      return {
        userId: u.id,
        // Public boards show an optional nickname; staff still receive the
        // verified name for classroom administration.
        fullName: u.nickname || u.fullName,
        ...(req.user!.role !== "student" ? { realName: u.fullName } : {}),
        avatarUrl: u.avatarUrl,
        xp,
        problemCount: problemCounts.get(u.id) ?? 0,
        submissionCount: 0,
        lessonCount: lessonCounts.get(u.id) ?? 0,
        streak: streakByUser.get(u.id) ?? 0,
        level: levelInfo.level,
        league: levelInfo.league,
        leagueEmoji: levelInfo.leagueEmoji,
        levelTitle: levelInfo.levelTitle,
        nextLevelXp: levelInfo.nextLevelXp,
        xpToNextLevel: levelInfo.xpToNextLevel,
        levelProgress: levelInfo.levelProgress,
      };
    });

    leaderboard.sort((a, b) => b.xp - a.xp);

    // Rank assignment
    const ranked = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

    // Rank change vs yesterday
    const yesterday = new Date(vnStartOfDay().getTime() - 86400000);
    const yesterdaySnaps = await prisma.rankSnapshot.findMany({ where: { date: yesterday } });
    const yesterdayMap = new Map(yesterdaySnaps.map((s) => [s.userId, s.rank]));

    // Badges
    const badges = await prisma.userBadge.findMany({ include: { badge: true } });
    const badgeMap: Record<string, { id: string; name: string; icon: string | null }[]> = {};
    badges.forEach((b) => {
      if (!badgeMap[b.userId]) badgeMap[b.userId] = [];
      badgeMap[b.userId].push({ id: b.badgeId, name: b.badge.name, icon: b.badge.icon });
    });

    // Rival (person just above you)
    const result = ranked.map((r, i) => {
      // rankChange is only meaningful on the all-time board. The daily snapshot
      // (ensureTodaySnapshot) stores ALL-TIME ranks, while today/week/month
      // boards rank windowed XP — comparing yesterday's all-time rank to a
      // windowed rank would blend two different rankings. Windowed boards show
      // no delta rather than a wrong arrow.
      const yesterdayRank = period === "all" ? yesterdayMap.get(r.userId) : undefined;
      const rankChange = yesterdayRank !== undefined ? yesterdayRank - r.rank : null;
      const rival = i > 0 ? {
        userId: ranked[i - 1].userId,
        fullName: ranked[i - 1].fullName,
        xp: ranked[i - 1].xp,
        xpDiff: ranked[i - 1].xp - r.xp,
        rank: ranked[i - 1].rank,
      } : null;

      return {
        ...r,
        rankChange,
        rival,
        badges: badgeMap[r.userId] || [],
      };
    });

    res.json({ leaderboard: result, period });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ── POST /leaderboard/claim-rewards ──
// Tự động chạy khi user mở trang: thưởng token cho top 10 tokens + top 10 streak.
// Idempotent: mỗi user được thưởng 1 lần/ngày cho mỗi bảng.
router.post("/claim-rewards", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

    const results: { type: string; rank: number; amount: number }[] = [];

    // Helper: thưởng cho 1 bảng, idempotent theo refId
    const awardIfEligible = async (type: string, rank: number) => {
      if (rank < 1 || rank > 10) return;
      const amount = (11 - rank) * 2;
      const refId = `${userId}_${todayKey}_${type}`;
      const existing = await prisma.tokenTransaction.findFirst({ where: { refType: `lb_reward_${type}`, refId } });
      if (existing) return; // đã thưởng hôm nay
      await awardTokens(userId, amount, {
        reason: "leaderboard_reward",
        description: `Top ${rank} bảng ${type === "tokens" ? "Vàng" : "Chuỗi"} ngày ${todayKey}`,
        refType: `lb_reward_${type}`,
        refId,
      });
      results.push({ type, rank, amount });
    };

    // Top tokens
    const topTokens = await prisma.user.findMany({
      where: { role: "student", status: "active" },
      select: { id: true },
      orderBy: { tokenBalance: "desc" },
      take: 10,
    });
    const tokenRank = topTokens.findIndex((u) => u.id === userId);
    if (tokenRank >= 0) await awardIfEligible("tokens", tokenRank + 1);

    // Top streak
    const streakByUser = await getStreakByUser();
    const topStreak = [...streakByUser.entries()]
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const streakRank = topStreak.findIndex(([id]) => id === userId);
    if (streakRank >= 0) await awardIfEligible("streak", streakRank + 1);

    res.json({ rewards: results });
  } catch (err: any) {
    console.error("Leaderboard claim error:", err);
    res.status(500).json({ error: err.message || "Failed to claim rewards" });
  }
});

// ── GET /leaderboard/history ──
router.get("/history", authenticate, async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    let dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from + "T00:00:00+07:00");
    if (to) {
      const toDate = new Date(to + "T00:00:00+07:00");
      toDate.setDate(toDate.getDate() + 1); // inclusive
      dateFilter.lte = toDate;
    }

    const snapshots = await prisma.rankSnapshot.findMany({
      where: { ...(from || to ? { date: dateFilter } : {}) },
      orderBy: [{ date: "asc" }, { rank: "asc" }],
      include: {
        user: { select: { fullName: true } },
      },
    });

    // Group by date
    const byDate: Record<string, any[]> = {};
    snapshots.forEach((s) => {
      const key = s.date.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        userId: s.userId,
        fullName: s.user.fullName,
        xp: s.xp,
        rank: s.rank,
        streak: s.streak,
        problemCount: s.problemCount,
      });
    });

    // Compute insights
    const dates = Object.keys(byDate).sort();
    let biggestClimber: any = null;
    let highestXpGain: any = null;
    let longestStreak: any = null;
    let mostActive: any = null;

    if (dates.length >= 2) {
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      const firstMap = new Map(byDate[firstDate].map((e: any) => [e.userId, e]));
      const lastMap = new Map(byDate[lastDate].map((e: any) => [e.userId, e]));

      for (const [uid, last] of lastMap) {
        const first = firstMap.get(uid);
        if (!first) continue;
        const rankGain = first.rank - last.rank;
        if (!biggestClimber || rankGain > biggestClimber.rankGain) {
          biggestClimber = { userId: uid, fullName: last.fullName, rankGain, from: first.rank, to: last.rank };
        }
        const xpGain = last.xp - first.xp;
        if (!highestXpGain || xpGain > highestXpGain.xpGain) {
          highestXpGain = { userId: uid, fullName: last.fullName, xpGain };
        }
        if (!longestStreak || last.streak > longestStreak.streak) {
          longestStreak = { userId: uid, fullName: last.fullName, streak: last.streak };
        }
        const problemGain = last.problemCount - first.problemCount;
        if (!mostActive || problemGain > mostActive.problemGain) {
          mostActive = { userId: uid, fullName: last.fullName, problemGain };
        }
      }
    }

    res.json({
      snapshots: byDate,
      dates,
      insights: { biggestClimber, highestXpGain, longestStreak, mostActive },
    });
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
