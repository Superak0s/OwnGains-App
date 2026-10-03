import { parseDate, toDateString } from "@utils/format";

export function dateStrPlusDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return dateStrPlusDays(dateStr, diffToMonday);
}

/** Timestamps are stored as UTC ISO strings, but a workout belongs to the day
 * the user trained on, so bucket by local calendar date rather than by the
 * date component of the raw string. */
export function sessionDateKey(
  startTime: string | null | undefined,
): string | null {
  const date = parseDate(startTime);
  return date ? toDateString(date) : null;
}

/**
 * Consecutive Monday-start weeks with at least one logged session, counting
 * back from the current week. Only fully elapsed weeks count. The current
 * week hasn't "gone" yet, so it's reported separately via currentWeekLogged.
 */
export function computeWeeklyStreak(
  dateKeys: Iterable<string>,
  today: Date = new Date(),
): { count: number; currentWeekLogged: boolean } {
  const weeks = new Set<string>();
  for (const key of dateKeys) weeks.add(mondayOfWeek(key));

  const todayMonday = mondayOfWeek(toDateString(today));
  let cursor = dateStrPlusDays(todayMonday, -7);
  let count = 0;
  while (weeks.has(cursor)) {
    count++;
    cursor = dateStrPlusDays(cursor, -7);
  }
  return { count, currentWeekLogged: weeks.has(todayMonday) };
}
