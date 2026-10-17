/**
 * Investment categories and the maths over them. Pure — no server imports —
 * so the same code drives the list in the browser and the verify script.
 *
 * A category is a short key. The presets below cover the usual buckets; any
 * other text the person types becomes its own custom category (stored
 * lower-cased so "Art" and "art" are one bucket) and gets its own total.
 */
import type { InvestmentLogEntry } from './types';

export interface InvestmentCategory { key: string; label: string; color: string }

export const PRESET_CATEGORIES: InvestmentCategory[] = [
  { key: 'stocks',       label: 'Stocks',               color: '#5F3DEB' },
  { key: 'gold',         label: 'Gold',                 color: '#D99A18' },
  { key: 'silver',       label: 'Silver',               color: '#8A93A6' },
  { key: 'mutual_funds', label: 'Mutual funds / ETFs',  color: '#00A0A6' },
  { key: 'fd_bonds',     label: 'FD / Bonds',           color: '#2B94C9' },
  { key: 'crypto',       label: 'Crypto',               color: '#DE7438' },
  { key: 'real_estate',  label: 'Real estate',          color: '#B8449B' },
  { key: 'other',        label: 'Other',                color: '#5C6180' },
];

const CUSTOM_COLORS = ['#E23B6B', '#7C5CF0', '#3C8D5A', '#C2410C', '#0E7490', '#A16207'];
const PRESET_BY_KEY = new Map(PRESET_CATEGORIES.map((c) => [c.key, c]));

/** Typed text -> a category key. Preset labels/keys map to the preset; anything else is a custom key. */
export function normaliseCategory(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 30).toLowerCase();
  if (!t) return 'other';
  const asKey = t.replace(/[\s/-]+/g, '_');
  if (PRESET_BY_KEY.has(asKey)) return asKey;
  const byLabel = PRESET_CATEGORIES.find((c) => c.label.toLowerCase() === t);
  return byLabel ? byLabel.key : t;
}

export function categoryLabel(key: string): string {
  const preset = PRESET_BY_KEY.get(key);
  if (preset) return preset.label;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function categoryColor(key: string): string {
  const preset = PRESET_BY_KEY.get(key);
  if (preset) return preset.color;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[h % CUSTOM_COLORS.length]!;
}

/**
 * Best guess for an entry that has no real category — i.e. everything saved
 * before categories existed, whose only clue is the free "Invested in" text.
 * Returns 'other' when nothing matches rather than guessing 'stocks'.
 */
export function inferCategory(investedIn: string): string {
  const t = investedIn.toLowerCase();
  if (/\b(gold|sgb|sovereign gold)\b/.test(t)) return 'gold';
  if (/\bsilver\b/.test(t)) return 'silver';
  if (/\b(fd|fixed deposit|bond|bonds|ppf|nps|rd|debenture)\b/.test(t)) return 'fd_bonds';
  if (/\b(bitcoin|btc|ethereum|eth|crypto|usdt|solana)\b/.test(t)) return 'crypto';
  if (/\b(mutual fund|mf|sip|index fund|etf|nifty|sensex|fund)\b/.test(t)) return 'mutual_funds';
  if (/\b(land|plot|flat|property|real estate)\b/.test(t)) return 'real_estate';
  if (/\b(stock|stocks|share|shares|equity)\b/.test(t)) return 'stocks';
  return 'other';
}

/** The entry's category, falling back to a guess only for rows that predate categories. An explicit 'other' is respected. */
export function entryCategory(e: Pick<InvestmentLogEntry, 'category' | 'invested_in'>): string {
  if (e.category && e.category.trim()) return e.category;
  return inferCategory(e.invested_in);
}

export interface CategoryTotal {
  key: string; label: string; color: string;
  total: number; count: number; share: number; // share is 0..100
  firstDate: string; lastDate: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cumulative amount per category, biggest first. */
export function totalsByCategory(entries: InvestmentLogEntry[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  let grand = 0;
  for (const e of entries) {
    const key = entryCategory(e);
    let row = map.get(key);
    if (!row) {
      row = { key, label: categoryLabel(key), color: categoryColor(key), total: 0, count: 0, share: 0, firstDate: e.date, lastDate: e.date };
      map.set(key, row);
    }
    row.total = r2(row.total + e.amount);
    row.count++;
    if (e.date < row.firstDate) row.firstDate = e.date;
    if (e.date > row.lastDate) row.lastDate = e.date;
    grand += e.amount;
  }
  return [...map.values()]
    .map((r) => ({ ...r, share: grand > 0 ? Math.round((r.total / grand) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Running total of each entry's category up to and including that entry,
 * keyed by entry id. Entries must already be oldest-first (getInvestmentLog
 * returns them that way), so a row's figure never changes when a newer one is
 * added.
 */
export function runningByCategory(entries: InvestmentLogEntry[]): Map<string, number> {
  const acc = new Map<string, number>();
  const out = new Map<string, number>();
  for (const e of entries) {
    const key = entryCategory(e);
    const next = r2((acc.get(key) ?? 0) + e.amount);
    acc.set(key, next);
    out.set(e.id, next);
  }
  return out;
}

export interface CumulativePoint { date: string; value: number }

/** Per category: a step series of cumulative invested amount over time, for the chart. */
export function cumulativeSeries(entries: InvestmentLogEntry[]): { key: string; label: string; color: string; points: CumulativePoint[] }[] {
  const acc = new Map<string, number>();
  const pts = new Map<string, CumulativePoint[]>();
  for (const e of entries) {
    const key = entryCategory(e);
    const next = r2((acc.get(key) ?? 0) + e.amount);
    acc.set(key, next);
    const list = pts.get(key) ?? [];
    const last = list[list.length - 1];
    if (last && last.date === e.date) last.value = next; else list.push({ date: e.date, value: next });
    pts.set(key, list);
  }
  return totalsByCategory(entries).map((c) => ({ key: c.key, label: c.label, color: c.color, points: pts.get(c.key) ?? [] }));
}
