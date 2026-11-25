/**
 * Vietnam-timezone calendar helpers.
 *
 * The container runs in UTC (verified: `docker exec codeclass-app date` -> UTC),
 * so anything that mixes a VN instant with Date's local-time methods is wrong by
 * one day for the 7 hours between VN midnight and UTC midnight.
 *
 * That is exactly what the previous week logic did:
 *
 *     const tmp = vnDate(now);        // correct instant: VN midnight
 *     const day = (tmp.getDay() + 6) % 7;  // ...but getDay() reads it in UTC,
 *     tmp.setDate(tmp.getDate() - day);    // where it is still 17:00 the day before
 *
 * VN midnight is 17:00 UTC on the previous day, so getDay() returned the
 * previous weekday and every week started on Tuesday. Measured before the fix:
 * 0 of 165 sampled instants landed on a Monday.
 *
 * The rule here: never call getDay/getDate/setDate on a Date to do VN calendar
 * maths. Extract the VN Y/M/D first, then do the arithmetic with UTC methods,
 * which are stable regardless of the host timezone.
 */

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Y/M/D as seen in Vietnam. month is 1-12. */
export function vnParts(d: Date = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ })
    .format(d)
    .split("-")
    .map(Number);
  return { year, month, day };
}

/** "YYYY-MM-DD" for the VN calendar day containing `d`. */
export function vnDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);
}

/** The instant of VN midnight starting the VN day containing `d`. */
export function vnStartOfDay(d: Date = new Date()): Date {
  return new Date(`${vnDayKey(d)}T00:00:00+07:00`);
}

/**
 * Weekday of a VN calendar date, Monday = 0 ... Sunday = 6.
 * Uses UTC internally so the host timezone cannot shift it.
 */
export function vnWeekdayMon0(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** The instant of VN midnight on the Monday that starts `d`'s VN week. */
export function vnStartOfWeek(d: Date = new Date()): Date {
  const { year, month, day } = vnParts(d);
  const offset = vnWeekdayMon0(year, month, day);
  const monday = new Date(Date.UTC(year, month - 1, day - offset));
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(
    `${monday.getUTCFullYear()}-${p(monday.getUTCMonth() + 1)}-${p(monday.getUTCDate())}T00:00:00+07:00`,
  );
}

/** VN midnight on the Monday that starts the week after `d`'s. */
export function vnStartOfNextWeek(d: Date = new Date()): Date {
  return new Date(vnStartOfWeek(d).getTime() + 7 * 86400000);
}

/** VN midnight on the 1st of `d`'s VN month. */
export function vnStartOfMonth(d: Date = new Date()): Date {
  const { year, month } = vnParts(d);
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`);
}

/**
 * ISO-8601 week key, e.g. "2026-W32", for the VN week containing `d`.
 *
 * Used as the idempotency key for weekly rewards, so it must be unique per week
 * and stable for every instant inside one week. The previous implementation
 * derived the week number from the day-of-month, so it restarted at W01 every
 * month and repeated keys across months; a repeated key made the "already
 * awarded?" lookup match a different week and silently skip the payout.
 */
export function vnWeekKey(d: Date = new Date()): string {
  const { year, month, day } = vnParts(d);
  const offset = vnWeekdayMon0(year, month, day);
  const monday = new Date(Date.UTC(year, month - 1, day - offset));
  // The ISO year is the year containing that week's Thursday.
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / 86400000 / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
