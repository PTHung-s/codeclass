/**
 * XP ledger — the write/read API for the incremental XP model.
 *
 * Mirrors tokens.ts: `User.xp` is the running total, `XpTransaction` is the
 * ledger, and awards are idempotent via a unique `dedupKey`. Everything that
 * used to rescan the whole DB to compute XP now reads a single column or a
 * windowed SUM over this table, so day/week/month filtering is cheap.
 */
import prisma from "./prisma";
import { getRates, getStreakConfig } from "./gamificationSettings";
import { computeLongestStreakFromDates, computeStreakFromDates, PRACTICE_XP_PER_MATCH, CONTEST_FINISH_XP, ADAPTIVE_PASS_XP } from "./xp";
import { notifyWalletChanged } from "./realtimeEvents";

/**
 * Streak params are admin-configurable ("Cấu hình điểm"):
 *  - minActiveMinutes: số phút active tối thiểu để một ngày được tính "học thật"
 *  - bridgeLookbackDays: khiên/bridge chỉ tự bắc cầu trong N ngày gần nhất
 */
async function getStreakParams() {
  const cfg = await getStreakConfig();
  return {
    minActiveSeconds: Math.max(0, Math.round(cfg.minActiveMinutes * 60)),
    lookbackDays: cfg.bridgeLookbackDays,
  };
}

const VN_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

/** Ngày "vào học nhẹ": có activity (>0s) nhưng dưới ngưỡng → bắc cầu miễn phí, không tốn khiên. */
async function getLightDayKeys(userId: string, minActiveSeconds: number): Promise<string[]> {
  const logs = await prisma.sessionLog.findMany({
    where: { userId, activeSeconds: { gt: 0, lt: minActiveSeconds } },
    select: { date: true },
  });
  return logs.map((l) => VN_FORMATTER.format(l.date));
}

/** Load XP days + session-log split (study vs light) cho một học sinh. */
async function getStreakActivity(userId: string): Promise<{
  dates: Date[];
  lightKeys: string[];
  minActiveSeconds: number;
  lookbackDays: number;
}> {
  const { minActiveSeconds, lookbackDays } = await getStreakParams();
  const [xpRows, logs] = await Promise.all([
    prisma.xpTransaction.findMany({
      where: { userId, reason: { notIn: ["backfill", "streak_bridge"] } },
      select: { createdAt: true },
    }),
    prisma.sessionLog.findMany({
      where: { userId, activeSeconds: { gt: 0 } },
      select: { date: true, activeSeconds: true },
    }),
  ]);
  const dates = [
    ...xpRows.map((r) => r.createdAt),
    ...logs.filter((l) => l.activeSeconds >= minActiveSeconds).map((l) => l.date),
  ];
  const lightKeys = logs
    .filter((l) => l.activeSeconds > 0 && l.activeSeconds < minActiveSeconds)
    .map((l) => VN_FORMATTER.format(l.date));
  return { dates, lightKeys, minActiveSeconds, lookbackDays };
}

/** Parse the persisted VN dates that an admin or a spent freeze has bridged. */
function parseBridgedDays(raw: string | null | undefined): string[] {
  return parseDayKeyJson(raw);
}

/** Parse persisted VN dates an admin/teacher manually rescued (lỗi hệ thống). */
function parseRescuedDays(raw: string | null | undefined): string[] {
  return parseDayKeyJson(raw);
}

function parseDayKeyJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      : [];
  } catch {
    return [];
  }
}

export { parseRescuedDays };

function bridgedDayDates(days: string[]): Date[] {
  return days.map((day) => new Date(`${day}T00:00:00+07:00`));
}

export interface XpAwardOptions {
  reason: string;
  description?: string;
  refType?: string;
  refId?: string;
  /** Override the dedup key entirely (for variable amounts like quiz delta). */
  dedupKey?: string;
  /** Timestamp for backfills; defaults to now. */
  at?: Date;
}

/**
 * Award XP to a user. Idempotent when refType+refId are provided:
 * enforced at the DB layer via a unique `dedupKey` (like awardTokens), so
 * concurrent duplicate calls cannot double-award. Keeps User.xp in sync.
 */
export async function awardXp(userId: string, amount: number, opts: XpAwardOptions): Promise<boolean> {
  if (amount <= 0) return false;
  const dedupKey = opts.dedupKey ?? (opts.refType && opts.refId ? `${userId}_${opts.refType}_${opts.refId}` : null);
  const at = opts.at ?? new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
      const balanceAfter = (user?.xp ?? 0) + amount;
      await tx.xpTransaction.create({
        data: {
          userId,
          amount,
          balanceAfter,
          type: "earn",
          reason: opts.reason,
          description: opts.description,
          refType: opts.refType,
          refId: opts.refId,
          createdAt: at,
          dedupKey,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { xp: balanceAfter } });
    });
    notifyWalletChanged(userId);
    return true;
  } catch (err: any) {
    // P2002 = unique constraint violation on dedupKey → already awarded
    if (err?.code === "P2002") return false;
    throw err;
  }
}

/** Fast total XP read. */
export async function getUserXp(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
  return user?.xp ?? 0;
}

/** XP per user earned at or after `since` (null = all time). For leaderboard windows. */
export async function sumXpInWindow(since: Date | null): Promise<Map<string, number>> {
  const rows = await prisma.xpTransaction.groupBy({
    by: ["userId"],
    where: since ? { createdAt: { gte: since } } : {},
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.amount ?? 0]));
}

/** Sum of XP earned for one (user, refType) — e.g. quiz delta needs prior quiz XP. */
export async function sumXpForRef(userId: string, refType: string, refId: string): Promise<number> {
  const rows = await prisma.xpTransaction.findMany({
    where: { userId, refType, refId },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + r.amount, 0);
}

/** Distinct-event counts by type (problems solved, lessons completed...) for dashboards. */
export async function countXp(userId: string, refType: string, since?: Date): Promise<number> {
  return prisma.xpTransaction.count({
    where: { userId, refType, ...(since ? { createdAt: { gte: since } } : {}) },
  });
}

/** Sum of XP earned for one (user, refType) — e.g. weekly problem XP. */
export async function getXpSumForType(userId: string, refType: string, since?: Date): Promise<number> {
  const rows = await prisma.xpTransaction.findMany({
    where: { userId, refType, ...(since ? { createdAt: { gte: since } } : {}) },
    select: { amount: true },
  });
  return rows.reduce((s, r) => s + r.amount, 0);
}

/** Distinct-event counts by type for ALL users (leaderboard badges, no N+1). */
export async function countXpByUser(refType: string, since?: Date): Promise<Map<string, number>> {
  const rows = await prisma.xpTransaction.groupBy({
    by: ["userId"],
    where: { refType, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.userId, r._count._all]));
}

/** Current streak per user for ALL users (leaderboard badge, no N+1). */
export async function getStreakByUser(): Promise<Map<string, number>> {
  const { minActiveSeconds, lookbackDays } = await getStreakParams();
  const [xpRows, lightLogs, users] = await Promise.all([
    prisma.xpTransaction.findMany({
      where: { reason: { notIn: ["backfill", "streak_bridge"] } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sessionLog.findMany({
      where: { activeSeconds: { gt: 0 } },
      select: { userId: true, date: true, activeSeconds: true },
    }),
    prisma.user.findMany({ select: { id: true, streakBridgedDays: true, streakRescuedDays: true, streakFreezes: true } }),
  ]);
  const byUser = new Map<string, Date[]>();
  for (const r of xpRows) {
    const arr = byUser.get(r.userId) ?? [];
    arr.push(r.createdAt);
    byUser.set(r.userId, arr);
  }
  const lightByUser = new Map<string, string[]>();
  for (const r of lightLogs) {
    const key = VN_FORMATTER.format(r.date);
    if (r.activeSeconds >= minActiveSeconds) {
      const arr = byUser.get(r.userId) ?? [];
      arr.push(r.date);
      byUser.set(r.userId, arr);
    } else {
      const arr = lightByUser.get(r.userId) ?? [];
      arr.push(key);
      lightByUser.set(r.userId, arr);
    }
  }
  const out = new Map<string, number>();
  const bridgesByUser = new Map(users.map((user) => [user.id, parseBridgedDays(user.streakBridgedDays)]));
  const rescuedByUser = new Map(users.map((user) => [user.id, parseRescuedDays(user.streakRescuedDays)]));
  const freezesByUser = new Map(users.map((user) => [user.id, user.streakFreezes]));
  for (const [userId, dates] of byUser) {
    out.set(
      userId,
      computeStreakFromDates(
        dates,
        freezesByUser.get(userId) ?? 0,
        bridgesByUser.get(userId) ?? [],
        rescuedByUser.get(userId) ?? [],
        lightByUser.get(userId) ?? [],
        lookbackDays,
      ).streak,
    );
  }
  return out;
}

/** All activity timestamps from the ledger, for streak computation. */
export async function getActivityDates(userId: string): Promise<Date[]> {
  return (await getStreakActivity(userId)).dates;
}

/** Current consecutive-day streak from ledger activity. */
export async function getStreak(userId: string): Promise<number> {
  const { dates, lightKeys, lookbackDays } = await getStreakActivity(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakBridgedDays: true, streakRescuedDays: true, streakFreezes: true } });
  return computeStreakFromDates(dates, user?.streakFreezes ?? 0, parseBridgedDays(user?.streakBridgedDays), parseRescuedDays(user?.streakRescuedDays), lightKeys, lookbackDays).streak;
}

export interface XpBreakdownLedger {
  xp: number;
  streak: number;
  longestStreak: number;
  problemCount: number;
  lessonCount: number;
  submissionCount: number;
}

/** Dashboard-shaped read: total + streak + per-type counts, all from the ledger. */
export async function getXpBreakdown(userId: string, since?: Date): Promise<XpBreakdownLedger> {
  const [xp, activity, problemCount, lessonCount, submissionCount, user] = await Promise.all([
    getUserXp(userId),
    getStreakActivity(userId),
    countXp(userId, "Problem", since),
    countXp(userId, "Lesson", since),
    countXp(userId, "Submission", since),
    prisma.user.findUnique({ where: { id: userId }, select: { streakBridgedDays: true, streakRescuedDays: true, streakFreezes: true } }),
  ]);
  const bridgedDays = parseBridgedDays(user?.streakBridgedDays);
  return {
    xp,
    streak: computeStreakFromDates(activity.dates, user?.streakFreezes ?? 0, bridgedDays, parseRescuedDays(user?.streakRescuedDays), activity.lightKeys, activity.lookbackDays).streak,
    longestStreak: computeLongestStreakFromDates([...activity.dates, ...bridgedDayDates(bridgedDays)]),
    problemCount,
    lessonCount,
    submissionCount,
  };
}

/**
 * Award the daily streak XP. Called whenever any XP-earning activity happens.
 * Two rules:
 *   - once per VN calendar day (dedupKey streak:<day>), so five activities on
 *     the same day still award one streak bonus;
 *   - amount grows with the streak length: day 1 = rate×1, day 2 = rate×2...
 *     A missed day resets the count → next activity starts again at rate×1.
 */
export async function awardStreakDay(userId: string, at: Date = new Date()): Promise<boolean> {
  const { xp: rates } = await getRates();
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(at);
  const existing = await prisma.xpTransaction.findUnique({
    where: { dedupKey: `${userId}_Streak_${dayKey}` },
    select: { id: true },
  });
  if (existing) return false;

  // Consecutive days ending today, from everything already in the ledger.
  // The user's unspent streak freezes may bridge exactly one missed day each;
  // newly bridged days are persisted here so reads agree without re-spending.
  // Light study days (opened the app but under the active-minutes threshold)
  // bridge for FREE — "có vào học" không bao giờ đốt khiên.
  const { dates, lightKeys, lookbackDays } = await getStreakActivity(userId);

  // Race-safe freeze spending. Concurrent XP awards can reach awardStreakDay
  // together; the old read→compute→decrement window let N parallel requests
  // each spend a freeze for the SAME bridged day (freezes went negative —
  // students reported shields vanishing without use). Fix: serialise per user
  // on the User row with a conditional decrement per new bridge, so a freeze
  // is only spent while the balance still covers it, and a bridged day is
  // claimed exactly once (its dedupKey row doubles as the claim marker).
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { streakBridgedDays: true, streakRescuedDays: true, streakFreezes: true },
    });
    const alreadyBridged = parseBridgedDays(user?.streakBridgedDays);
    const freezes = user?.streakFreezes ?? 0;
    const { streak, bridgedDays, freeBridgedDays } = computeStreakFromDates(
      [...dates, at],
      freezes,
      alreadyBridged,
      parseRescuedDays(user?.streakRescuedDays),
      lightKeys,
      lookbackDays,
    );

    const newBridges = bridgedDays.filter((d) => !alreadyBridged.includes(d));
    const newFree = freeBridgedDays.filter((d) => !alreadyBridged.includes(d));
    // Free bridges (light study days) cần được persist để các lần đọc sau nhất quán.
    if (newFree.length > 0) {
      const finalFree = [...alreadyBridged, ...newFree];
      await tx.user.update({
        where: { id: userId },
        data: { streakBridgedDays: JSON.stringify([...new Set(finalFree)]) },
      });
      alreadyBridged.push(...newFree);
    }
    if (newBridges.length > 0) {
      // Dedup-existing-bridge fast path: another transaction may have claimed
      // some of these days between our read and now — those need no re-spend.
      const existingClaims = await tx.xpTransaction.findMany({
        where: { userId, dedupKey: { in: newBridges.map((d) => `${userId}_StreakBridge_${d}`) } },
        select: { dedupKey: true },
      });
      const claimed = new Set(existingClaims.map((r) => r.dedupKey));
      const unclaimed = newBridges.filter((d) => !claimed.has(`${userId}_StreakBridge_${d}`));
      // Claim each unclaimed day inside the same tx, decrementing only while
      // the balance allows it (guards the negative-freeze window entirely).
      let spent = 0;
      for (const d of unclaimed) {
        const updated = await tx.user.updateMany({
          where: { id: userId, streakFreezes: { gte: 1 } },
          data: { streakFreezes: { decrement: 1 } },
        });
        if (updated.count === 0) break; // out of freezes — leave the rest unclaimed
        await tx.xpTransaction.create({
          data: {
            userId,
            amount: 0,
            balanceAfter: 0,
            type: "freeze_spend",
            reason: "streak_bridge",
            description: `Khiên bảo vệ ngày ${d}`,
            refType: "Streak",
            refId: d,
            dedupKey: `${userId}_StreakBridge_${d}`,
          },
        });
        spent++;
      }
      if (spent > 0) {
        const finalBridged = [...alreadyBridged, ...unclaimed.slice(0, spent)];
        await tx.user.update({
          where: { id: userId },
          data: { streakBridgedDays: JSON.stringify([...new Set(finalBridged)]) },
        });
      }
      // Recompute the streak with only the days we actually secured.
      const secured = [...new Set([...alreadyBridged, ...unclaimed.slice(0, spent)])];
      const recount = computeStreakFromDates(
        [...dates, at],
        0,
        secured,
        parseRescuedDays(user?.streakRescuedDays),
        lightKeys,
        lookbackDays,
      );
      // freezes=0 here: remaining budget is already reflected by secured days.
      return { streak: recount.streak, bridgedDays: secured };
    }

    return { streak, bridgedDays };
  }, { timeout: 15000 });

  const amount = rates.streakXp * result.streak;

  return awardXp(userId, amount, {
    reason: "streak_day",
    description: `Streak ${result.streak} ngày`,
    refType: "Streak",
    refId: dayKey,
    at,
  });
}

export { PRACTICE_XP_PER_MATCH, CONTEST_FINISH_XP, ADAPTIVE_PASS_XP };

/**
 * XP for passing an adaptive chapter test — once per passed attempt + streak day.
 * Called from the four adaptive completion paths (next-complete, force-complete,
 * state-complete, apply) so behaviour is identical everywhere.
 */
export async function awardAdaptivePassXp(userId: string, passed: boolean, attemptId: string | null): Promise<void> {
  if (!passed || !attemptId) return;
  await awardXp(userId, ADAPTIVE_PASS_XP, {
    reason: "adaptive_passed",
    description: "Vượt bài kiểm tra chương",
    refType: "Adaptive",
    refId: attemptId,
  });
  await awardStreakDay(userId);
}


// ── Streak history (per-day calendar for the history UI) ──

export type StreakDayStatus = "study" | "bridged" | "rescued" | "light" | "missed";

export interface StreakDay {
  /** VN "YYYY-MM-DD" */
  date: string;
  status: StreakDayStatus;
  /** XP earned that day (tooltip "từng ngày như nào") */
  xp: number;
  /** true nếu ngày này bắt đầu khoảng nghỉ làm gãy chuỗi */
  lost: boolean;
}

export interface StreakHistory {
  days: StreakDay[];
  currentStreak: number;
  longestStreak: number;
  /** Khiên còn lại chưa dùng */
  freezes: number;
  /** Tổng số ngày đã được khiên che (toàn bộ lịch sử) */
  bridgesUsed: number;
  /** Tổng số ngày được admin cứu */
  rescuedCount: number;
  /** Các ngày bắt đầu khoảng nghỉ làm gãy chuỗi */
  breakDates: string[];
  /** Ngày học gần nhất (VN key) */
  lastStudyDate: string | null;
}

const VN_DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

function addDaysKey(key: string, n: number): string {
  return VN_DAY_KEY.format(new Date(new Date(`${key}T00:00:00+07:00`).getTime() + n * 86400000));
}

/** Status per day over [fromKey..toKey]; study wins over rescued, then bridged, then missed. */
function buildDayStatuses(
  studyKeys: Set<string>,
  bridged: string[],
  rescued: string[],
  fromKey: string,
  toKey: string,
  lightKeys: Set<string> = new Set(),
): { date: string; status: StreakDayStatus }[] {
  const bridgedSet = new Set(bridged);
  const rescuedSet = new Set(rescued);
  const out: { date: string; status: StreakDayStatus }[] = [];
  for (let key = fromKey; key <= toKey; key = addDaysKey(key, 1)) {
    const status: StreakDayStatus = studyKeys.has(key)
      ? "study"
      : rescuedSet.has(key)
        ? "rescued"
        : lightKeys.has(key)
          ? "light"
          : bridgedSet.has(key)
            ? "bridged"
            : "missed";
    out.push({ date: key, status });
    if (key === toKey) break; // guard against clock drift
  }
  return out;
}

/**
 * A missed day "loses the streak" when it starts a gap that later has activity
 * again (a real break), or when it starts the trailing gap that has already
 * killed the current streak (tail missed days exceeded freezes + rescues).
 */
function findBreakDates(
  statuses: { date: string; status: StreakDayStatus }[],
  currentStreak: number,
): string[] {
  const breaks: string[] = [];
  let seenActive = false;
  let gapStart: string | null = null;
  for (const day of statuses) {
    if (day.status === "missed") {
      if (seenActive && !gapStart) gapStart = day.date;
      continue;
    }
    if (gapStart) {
      breaks.push(gapStart); // activity returned → the gap truly broke the chain
      gapStart = null;
    }
    seenActive = true;
  }
  // Trailing gap with no return yet: if the live streak is already dead, the
  // first missed day of that gap is the loss date.
  if (gapStart && currentStreak === 0 && seenActive) breaks.push(gapStart);
  return breaks;
}

/** Per-day streak calendar for one user (student self view + teacher drill-down). */
export async function getStreakHistory(userId: string, daysBack = 70): Promise<StreakHistory> {
  const capped = Math.max(7, Math.min(366, Math.floor(daysBack) || 70));
  const todayKey = VN_DAY_KEY.format(new Date());
  const fromKey = addDaysKey(todayKey, -(capped - 1));
  const windowStart = new Date(`${fromKey}T00:00:00+07:00`);

  const [activity, xpRows, user] = await Promise.all([
    getStreakActivity(userId),
    prisma.xpTransaction.findMany({
      where: { userId, reason: { notIn: ["backfill", "streak_bridge"] }, createdAt: { gte: windowStart } },
      select: { amount: true, createdAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { streakFreezes: true, streakBridgedDays: true, streakRescuedDays: true },
    }),
  ]);
  const { dates, lightKeys, lookbackDays } = activity;

  const bridged = parseBridgedDays(user?.streakBridgedDays);
  const rescued = parseRescuedDays(user?.streakRescuedDays);
  const freezes = user?.streakFreezes ?? 0;

  const studyKeys = new Set(dates.map((d) => VN_DAY_KEY.format(d)));
  const statuses = buildDayStatuses(studyKeys, bridged, rescued, fromKey, todayKey, new Set(lightKeys));

  // XP per VN day within the window.
  const xpByDay = new Map<string, number>();
  for (const row of xpRows) {
    const key = VN_DAY_KEY.format(row.createdAt);
    xpByDay.set(key, (xpByDay.get(key) ?? 0) + row.amount);
  }

  const currentStreak = computeStreakFromDates(dates, freezes, bridged, rescued, lightKeys, lookbackDays).streak;
  const longestStreak = computeLongestStreakFromDates([
    ...dates,
    ...bridgedDayDates(bridged),
    ...bridgedDayDates(rescued),
  ]);
  const breakDates = findBreakDates(statuses, currentStreak);
  const breakSet = new Set(breakDates);
  const lastStudyDate = [...studyKeys].sort().pop() ?? null;

  return {
    days: statuses.map(({ date, status }) => ({
      date,
      status,
      xp: status === "study" ? xpByDay.get(date) ?? 0 : 0,
      lost: breakSet.has(date),
    })),
    currentStreak,
    longestStreak,
    freezes,
    bridgesUsed: bridged.length,
    rescuedCount: rescued.length,
    breakDates,
    lastStudyDate,
  };
}

export interface StreakStudentSummary {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  currentStreak: number;
  longestStreak: number;
  freezes: number;
  /** Ngày học gần nhất (VN key, null nếu chưa từng học) */
  lastStudyDate: string | null;
  /** Ngày mất chuỗi gần nhất (VN key, null nếu chưa từng gãy) */
  lastBreakDate: string | null;
  rescuedCount: number;
}

/** Streak summary for ALL active students — teacher/admin overview list. */
export async function getStreakOverview(): Promise<StreakStudentSummary[]> {
  const { minActiveSeconds, lookbackDays } = await getStreakParams();
  const [xpRows, studyRows, students] = await Promise.all([
    prisma.xpTransaction.findMany({
      where: { reason: { notIn: ["backfill", "streak_bridge"] } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sessionLog.findMany({
      where: { activeSeconds: { gt: 0 } },
      select: { userId: true, date: true, activeSeconds: true },
    }),
    prisma.user.findMany({
      where: { role: "student", status: "active" },
      select: { id: true, fullName: true, avatarUrl: true, streakFreezes: true, streakBridgedDays: true, streakRescuedDays: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const datesByUser = new Map<string, Date[]>();
  for (const r of xpRows) {
    const arr = datesByUser.get(r.userId) ?? [];
    arr.push(r.createdAt);
    datesByUser.set(r.userId, arr);
  }
  const lightByUser = new Map<string, string[]>();
  for (const r of studyRows) {
    if (r.activeSeconds >= minActiveSeconds) {
      const arr = datesByUser.get(r.userId) ?? [];
      arr.push(r.date);
      datesByUser.set(r.userId, arr);
    } else {
      const arr = lightByUser.get(r.userId) ?? [];
      arr.push(VN_DAY_KEY.format(r.date));
      lightByUser.set(r.userId, arr);
    }
  }

  const todayKey = VN_DAY_KEY.format(new Date());
  // Overview break scan window — long enough to catch any realistic chain.
  const fromKey = addDaysKey(todayKey, -364);

  return students.map((student) => {
    const dates = datesByUser.get(student.id) ?? [];
    const bridged = parseBridgedDays(student.streakBridgedDays);
    const rescued = parseRescuedDays(student.streakRescuedDays);
    const freezes = student.streakFreezes ?? 0;
    const studyKeys = new Set(dates.map((d) => VN_DAY_KEY.format(d)));
    const statuses = buildDayStatuses(studyKeys, bridged, rescued, fromKey, todayKey, new Set(lightByUser.get(student.id) ?? []));
    const currentStreak = computeStreakFromDates(dates, freezes, bridged, rescued, lightByUser.get(student.id) ?? [], lookbackDays).streak;
    const breaks = findBreakDates(statuses, currentStreak);
    return {
      userId: student.id,
      fullName: student.fullName,
      avatarUrl: student.avatarUrl,
      currentStreak,
      longestStreak: computeLongestStreakFromDates([...dates, ...bridgedDayDates(bridged), ...bridgedDayDates(rescued)]),
      freezes,
      lastStudyDate: [...studyKeys].sort().pop() ?? null,
      lastBreakDate: breaks.length > 0 ? breaks[breaks.length - 1] : null,
      rescuedCount: rescued.length,
    };
  });
}
