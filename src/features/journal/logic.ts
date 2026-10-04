import { HOME_TZ } from '@/lib/tz/today';
import type { DaySummary, JournalEntry } from './types';

// Pure helpers — no I/O, so scripts/verify-journal.ts can test them directly.

/** True only for real calendar dates: '2026-02-30' matches the shape but isn't one. */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Use the value if it's a real date, otherwise the fallback (normally today). */
export function parseDateParam(raw: unknown, fallback: string): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return isRealIsoDate(v) ? v : fallback;
}

/** 'Today' / 'Yesterday' / 'Tomorrow' / 'Sat, 3 Oct 2026' */
export function formatDayLabel(iso: string, today: string): string {
  const diff = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Short form for the rail: 'Sat, 3 Oct'. */
export function formatDayShort(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Wall-clock time of an entry in the home timezone, e.g. '3:42 pm'. */
export function formatEntryTime(isoTimestamp: string, timeZone: string = HOME_TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(isoTimestamp));
}

/** Collapse entries into one summary per day, newest day first. */
export function summariseDays(entries: JournalEntry[], limit = 45): DaySummary[] {
  const byDay = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.entry_date);
    if (list) list.push(e); else byDay.set(e.entry_date, [e]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([date, list]) => {
      const latest = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]!;
      const firstLine = latest.content.split('\n').find((l) => l.trim()) ?? '';
      return {
        date,
        count: list.length,
        preview: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
      };
    });
}

/** Case-insensitive match; every whitespace-separated word must appear. */
export function matchesQuery(content: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const hay = content.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Most recent moment the user wrote or edited anything, as an ISO string. */
export function latestActivity(entries: JournalEntry[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    const t = e.updated_at > e.created_at ? e.updated_at : e.created_at;
    if (best === null || t > best) best = t;
  }
  return best;
}
