/**
 * What day it is *where you are*, not where the server is.
 *
 * `new Date().toISOString().slice(0,10)` is UTC, so from midnight to 5:30am
 * IST it reports yesterday — the Today board would open on the wrong day and
 * tasks captured in that window would be filed under the previous date. On a
 * serverless host the process timezone is UTC by default, so this is not a
 * theoretical edge case; it's every early morning.
 *
 * 'en-CA' is used because it formats as YYYY-MM-DD, which is the same shape
 * as the stored dates.
 */
export const HOME_TZ = process.env.NEXT_PUBLIC_HOME_TZ || 'Asia/Kolkata';

export function isoDateIn(date: Date, timeZone: string = HOME_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Today's date in the home timezone, as 'YYYY-MM-DD'. */
export function todayIso(timeZone: string = HOME_TZ): string {
  return isoDateIn(new Date(), timeZone);
}

/** Shift a 'YYYY-MM-DD' string by whole days without touching timezones. */
export function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
