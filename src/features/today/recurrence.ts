/**
 * Pure date maths for repeating tasks. No server imports, so the same
 * function drives the live preview in the browser and the real insert on
 * the server — what you see in "Will create N tasks" is exactly what gets
 * written.
 *
 * Dates are 'YYYY-MM-DD' strings and weekdays are 0 (Sun) .. 6 (Sat). All
 * arithmetic is done in UTC on date-only values, so no timezone can shift a
 * day.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** Hard ceiling so a typo'd end year can't create thousands of rows. */
export const MAX_OCCURRENCES = 366;

export interface RecurrenceInput {
  start: string;          // first possible day
  end: string;            // last possible day (inclusive) — required
  weekdays: number[];     // which weekdays it repeats on
  skip: string[];         // festival / holiday / leave dates to leave out
}

const toUtc = (iso: string) => {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isValidIso(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  return toIso(toUtc(s)) === s; // rejects 2026-02-31
}

export function weekdayOf(iso: string): number {
  return toUtc(iso).getUTCDay();
}

export interface Expansion {
  dates: string[];
  skippedByHoliday: number;   // days that matched the weekdays but were on the skip list
  truncated: boolean;         // hit MAX_OCCURRENCES
}

export function expandDates(input: RecurrenceInput): Expansion {
  const { start, end } = input;
  if (!isValidIso(start) || !isValidIso(end) || end < start) {
    return { dates: [], skippedByHoliday: 0, truncated: false };
  }
  const days = new Set(input.weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
  const skip = new Set(input.skip.filter(isValidIso));
  const dates: string[] = [];
  let skippedByHoliday = 0;
  let truncated = false;

  for (let d = toUtc(start); toIso(d) <= end; d = new Date(d.getTime() + 86_400_000)) {
    if (!days.has(d.getUTCDay())) continue;
    const iso = toIso(d);
    if (skip.has(iso)) { skippedByHoliday++; continue; }
    if (dates.length >= MAX_OCCURRENCES) { truncated = true; break; }
    dates.push(iso);
  }
  return { dates, skippedByHoliday, truncated };
}

/** "09:30" -> 570. Returns null for anything that isn't HH:MM. */
export function parseTimeInput(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
