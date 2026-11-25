/**
 * XP shared helpers.
 *
 * XP is now an incremental ledger (`XpTransaction` + `User.xp`, see
 * xpLedger.ts) — the recompute-everything functions that used to live here
 * (calculateUserXp / calculateAllStudentXp / scoreStudents) are gone. This file
 * keeps the constants and the streak math that both the ledger and the screens
 * depend on.
 */

// XP granted per completed solo practice match (Code Debug Arena).
export const PRACTICE_XP_PER_MATCH = 10;
// XP granted per finished contest / passed adaptive chapter test.
// Kept here — not in a route — so every award site reads the same constants.
export const CONTEST_FINISH_XP = 15;
export const ADAPTIVE_PASS_XP = 20;

export function difficultyXpFromRates(
  difficulty: string,
  rates: { problemEasyXp: number; problemMediumXp: number; problemHardXp: number }
): number {
  switch (difficulty) {
    case "easy":
      return rates.problemEasyXp;
    case "hard":
      return rates.problemHardXp;
    case "medium":
      return rates.problemMediumXp;
    default:
      return rates.problemMediumXp;
  }
}

// ── Streak math (used by xpLedger) ──

/**
 * Compute the current consecutive-day streak from a list of activity dates.
 *
 * Streak freezes ("khiên") protect missed days one-for-one: N freezes keep the
 * streak alive through up to N missed days ("bao nhiêu khiên bảo vệ bấy nhiêu
 * ngày"). Each missed day — whether between two activity days or between the
 * latest activity day and today — costs one freeze.
 *
 * `lightDays` are VN day keys where the student DID open the app and study
 * a little (some tracked activity) but under the active-minutes threshold and
 * without earning XP. Those days bridge for FREE — no freeze is spent —
 * because "có vào học" should never burn a shield.
 *
 * `lookbackDays` caps retro-active bridging: only missed days within the last
 * N days (relative to the newest activity day) may be bridged, free or paid.
 * Older gaps break the streak instead of silently draining the freeze stock
 * months later. 0 disables retro-bridging entirely (only today-links survive).
 *
 * The streak counts ONLY real study days. Bridged days keep the run alive but
 * never add to the count, so returning after a shielded absence adds just
 * today's study day instead of inflating the streak.
 *
 * `alreadyBridgedDays` are VN "YYYY-MM-DD" days a previous freeze already
 * filled in — they are seeded into the key set, so those gaps close for free
 * and only genuinely new gaps consume a freeze. Returns the streak plus the
 * full bridged day list (past + newly used) so the caller can persist the
 * spent freezes once.
 */
export function computeStreakFromDates(
  dates: Date[],
  freezeCount: number = 0,
  alreadyBridgedDays: string[] = [],
  rescuedDays: string[] = [],
  lightDays: string[] = [],
  lookbackDays: number | null = null,
): { streak: number; bridgedDays: string[]; freeBridgedDays: string[] } {
  const df = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const studyKeys = dates.map((d) => df.format(d));
  const studyKeySet = new Set(studyKeys);
  // Admin-rescued days behave like bridged days (keep the run alive without
  // adding to the length) but never consume a freeze.
  const rescuedSet = new Set(rescuedDays);
  // Light study days bridge for FREE (student opened the app but under the
  // active-minutes threshold, no XP) — they are keys in their own right, so
  // gaps that contain them simply close without touching the freeze stock.
  const lightSet = new Set(lightDays.filter((k) => !studyKeySet.has(k) && !rescuedSet.has(k)));
  const keys = [...new Set([...studyKeys, ...alreadyBridgedDays, ...rescuedDays, ...lightSet])].sort();
  if (keys.length === 0) return { streak: 0, bridgedDays: alreadyBridgedDays, freeBridgedDays: [] };
  // Retro-bridging cap: missed days at or before this key may NOT be bridged —
  // the gap breaks the run instead of silently draining months-old freezes.
  const cutoffKey =
    lookbackDays != null && lookbackDays >= 0
      ? df.format(new Date(new Date(`${keys[keys.length - 1]}T00:00:00+07:00`).getTime() - lookbackDays * 86400000))
      : null;
  // Missed days between the latest activity and today. The streak survives as
  // long as the freezes can cover them ("N khiên bảo vệ N ngày"). On the write
  // path today is already a key, so this is 0 and the walk gets the full budget.
  // Rescued and light days in the tail gap are free — they don't count against
  // freezes.
  const latest = new Date(`${keys[keys.length - 1]}T00:00:00+07:00`);
  const today = new Date(`${df.format(new Date())}T00:00:00+07:00`);
  const daysSinceLatest = Math.round((today.getTime() - latest.getTime()) / 86400000);
  let missedSinceLatest = 0;
  for (let m = 1; m < daysSinceLatest; m++) {
    const key = df.format(new Date(latest.getTime() + m * 86400000));
    if (!rescuedSet.has(key) && !lightSet.has(key)) missedSinceLatest++;
  }
  if (missedSinceLatest > freezeCount) {
    return { streak: 0, bridgedDays: alreadyBridgedDays, freeBridgedDays: [] };
  }
  // The streak counts ONLY real study days. Bridged days keep the run alive
  // but never add to the count, so returning after a shielded absence adds
  // just today's study day instead of inflating the streak.
  let streak = studyKeySet.has(keys[keys.length - 1]) ? 1 : 0;
  // Reserve the tail-gap freezes; the rest may bridge internal gaps.
  let freezes = freezeCount - missedSinceLatest;
  const bridged = [...alreadyBridgedDays];
  let survivedFrom = keys.length - 1;
  for (let i = keys.length - 1; i > 0; i--) {
    const d1key = keys[i - 1];
    const d1 = new Date(`${d1key}T00:00:00+07:00`);
    const d2 = new Date(`${keys[i]}T00:00:00+07:00`);
    const gap = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    const missed = gap - 1;
    // Rescued and light missed days bridge for free; the rest cost one freeze.
    const missedDays = Array.from({ length: missed }, (_, m) =>
      df.format(new Date(d1.getTime() + (m + 1) * 86400000)));
    const costly = missedDays.filter((k) => !rescuedSet.has(k) && !lightSet.has(k));
    if (costly.length > freezes) break;
    // Lookback cap: a gap reaching before the cutoff breaks the run — never
    // bridge it, even if the freeze stock could afford it.
    if (cutoffKey && missedDays.some((k) => k <= cutoffKey)) break;
    // Bridge every missed day between d1 and d2. Bridged days keep the run
    // alive but do NOT count toward the streak length; rescued days stay in
    // their own list (user.streakRescuedDays) and are not duplicated here.
    for (const k of costly) bridged.push(k);
    freezes -= costly.length;
    if (studyKeySet.has(d1key)) streak++;
    survivedFrom = i - 1;
  }
  // Light days that ended up inside the survived chain (latest → survivedFrom).
  const freeBridgedDays = keys.slice(survivedFrom).filter((k) => lightSet.has(k));
  return { streak, bridgedDays: [...new Set(bridged)], freeBridgedDays };
}

/**
 * The best uninterrupted run in the full activity history. Unlike the current
 * streak, this deliberately remains after a later missed day — it is a
 * student's personal record, not a live reward multiplier.
 */
export function computeLongestStreakFromDates(dates: Date[]): number {
  const df = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const keys = [...new Set(dates.map((date) => df.format(date)))].sort();
  if (keys.length === 0) return 0;

  let longest = 1;
  let run = 1;
  for (let index = 1; index < keys.length; index += 1) {
    const previous = new Date(`${keys[index - 1]}T00:00:00+07:00`);
    const current = new Date(`${keys[index]}T00:00:00+07:00`);
    if (Math.round((current.getTime() - previous.getTime()) / 86400000) === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  return longest;
}
