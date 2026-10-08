/** Month/year helpers for the Daily Finance pages (month = "YYYY-MM"). */

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** A valid "YYYY-MM" that isn't in the future; anything else falls back to the current month. */
export function parseMonth(raw: string | undefined, current: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= current ? raw : current;
}

export function parseYear(raw: string | undefined, current: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= current ? n : current;
}

export function monthTitle(ym: string, style: 'long' | 'short' = 'long'): string {
  return new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: style, year: 'numeric', timeZone: 'UTC' });
}
