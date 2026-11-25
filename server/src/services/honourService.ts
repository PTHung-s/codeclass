import prisma from "../utils/prisma";
import { vnDayKey, vnStartOfWeek } from "../utils/vnTime";
import { getAvatarById, getAvatarUrl, getDefaultAvatar } from "../utils/avatarShop";

/** How long a computed top-3 stays cached. The weekly ranking barely moves, and
 *  recomputing it on every page load would run queries per visit against a
 *  single-writer SQLite database. The cache key is the *day*, so the ranking
 *  still re-emits each day even though the underlying source is weekly. */
const CACHE_MS = 60_000;

export interface Honouree {
  userId: string;
  fullName: string;
  rank: number;
  xp: number;
  avatarUrl: string;
  avatarName: string;
}

let cache: { dayKey: string; at: number; list: Honouree[] } | null = null;

/**
 * Top 3 students of the current VN week (Monday 00:00 Asia/Ho_Chi_Minh).
 *
 * The CEREMONY runs daily — a new card flies in for every viewer each morning
 * — but the RANKING is weekly, so the three students being honoured stay
 * consistent with /leaderboard's "Tuần này" tab. Honouring a different trio
 * each day (the daily window) felt arbitrary: a student who put in a long
 * Monday and a quiet Tuesday could be #1 on Monday's cards, off the list on
 * Wednesday, and back on Friday with nothing having changed.
 *
 * Scored from the XP ledger (sumXpInWindow), the same source /leaderboard uses,
 * so the cards and the leaderboard's "Tuần này" tab cannot disagree.
 *
 * Students with zero activity this week are excluded: an empty week should
 * honour nobody rather than the top of an all-time table.
 */
export async function getWeeklyTop3(): Promise<Honouree[]> {
  const dayKey = vnDayKey();
  if (cache && cache.dayKey === dayKey && Date.now() - cache.at < CACHE_MS) {
    return cache.list;
  }

  // Same population as /leaderboard: no roster filter. The roster-exclusion list
  // is an attendance/tuition tool and holds real active students, so filtering on
  // it here would both hide their work and reintroduce the mismatch between the
  // cards and the leaderboard.
  const { sumXpInWindow } = await import("../utils/xpLedger");
  const xpMap = await sumXpInWindow(vnStartOfWeek());
  const users = await prisma.user.findMany({
    where: { role: "student", status: "active" },
    select: { id: true, fullName: true, nickname: true, avatarUrl: true, selectedAvatar: true },
  });
  const scored = users
    .map((u) => ({ ...u, xp: xpMap.get(u.id) ?? 0 }))
    .filter((row) => row.xp > 0)
    .sort((a, b) => b.xp - a.xp);

  const list: Honouree[] = scored
    .slice(0, 3)
    .map((row, index) => {
      const tier = getAvatarById(row.selectedAvatar) ?? getDefaultAvatar();
      return {
        userId: row.id,
        fullName: row.nickname?.trim() || row.fullName,
        rank: index + 1,
        xp: row.xp,
        // The mascot the student picked in the avatar shop, falling back to the
        // legacy avatarUrl only if the tier lookup somehow fails.
        avatarUrl: getAvatarUrl(tier.animalName) || row.avatarUrl || "",
        avatarName: tier.name,
      };
    });

  cache = { dayKey, at: Date.now(), list };
  return list;
}

/** Drop the cache — used after a manual recompute so admins see it immediately. */
export function invalidateWeeklyTop3(): void {
  cache = null;
}

export interface PendingCard extends Honouree {
  /** The honouree does not have to praise themselves. */
  selfCard: boolean;
}

/**
 * Cards this viewer should be shown right now.
 *
 * A card qualifies when the honouree is currently online AND the viewer still
 * owes them something. What "still owes" means differs by card:
 *
 * - Someone else's card is owed until the compliment is actually written, so it
 *   is retired by a HonourPraise row. It is deliberately NOT retired by having
 *   been displayed: keying on the display event is what made the ceremony
 *   skippable. One F5 during the fly-in recorded a showing, the refetch came
 *   back empty, and the card never returned for the rest of the day.
 * - The viewer's own card asks for nothing, so being displayed once is enough
 *   (HonourShowing). Otherwise the honouree would meet their own trophy on
 *   every page load until midnight VN.
 *
 * Both keys are per (viewer, honouree, day), so three honourees coming online
 * at three different times produce three separate cards for the same viewer.
 *
 * NB: the database column is still called `weekKey` for backwards compatibility
 * with the previous weekly design — its value is now a `vnDayKey()` like
 * "2026-08-07". New rows simply use the daily format; old weekly rows are inert.
 */
export async function getPendingCards(
  viewerId: string,
  onlineUserIds: Set<string>,
): Promise<PendingCard[]> {
  const top3 = await getWeeklyTop3();
  if (top3.length === 0) return [];

  const dayKey = vnDayKey();
  const honoureeIds = top3.map((h) => h.userId);
  const [praised, seen] = await Promise.all([
    prisma.honourPraise.findMany({
      where: { authorId: viewerId, weekKey: dayKey, honoureeId: { in: honoureeIds } },
      select: { honoureeId: true },
    }),
    prisma.honourShowing.findMany({
      where: { viewerId, weekKey: dayKey, honoureeId: { in: honoureeIds } },
      select: { honoureeId: true },
    }),
  ]);
  const praisedIds = new Set(praised.map((p) => p.honoureeId));
  const seenIds = new Set(seen.map((s) => s.honoureeId));

  return top3
    .filter((h) => onlineUserIds.has(h.userId))
    .map((h) => ({ ...h, selfCard: h.userId === viewerId }))
    .filter((c) => (c.selfCard ? !seenIds.has(c.userId) : !praisedIds.has(c.userId)));
}

/**
 * Record that these cards reached the screen.
 *
 * This is first-seen bookkeeping, and the retirement key for the viewer's own
 * card only. A card awaiting a compliment survives this call on purpose — see
 * getPendingCards().
 *
 * NB: the `weekKey` column now stores `vnDayKey()` values (see getPendingCards).
 */
export async function markShown(viewerId: string, cards: PendingCard[]): Promise<void> {
  if (cards.length === 0) return;
  const dayKey = vnDayKey();
  await prisma.$transaction(
    cards.map((c) =>
      prisma.honourShowing.upsert({
        where: {
          viewerId_honoureeId_weekKey: { viewerId, honoureeId: c.userId, weekKey: dayKey },
        },
        create: { viewerId, honoureeId: c.userId, weekKey: dayKey, rank: c.rank },
        update: {},
      }),
    ),
  );
}
