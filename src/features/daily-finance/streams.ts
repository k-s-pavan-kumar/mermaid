/**
 * Income streams — pure maths, no I/O, so it can be checked without a DB.
 *
 * A stream is a named bucket (Salary, Bug bounty, Client work…) with a
 * yearly target. Income is never typed in (see types.ts), so a stream does
 * not hold money itself: it OWNS a set of income categories, and every
 * income entry whose category belongs to it counts toward its target.
 * Income whose category no stream owns lands in "Unassigned", so the
 * streams always add up to the Income YTD figure and nothing is hidden.
 */
import type { FinanceEntry } from './types';

export interface IncomeStream {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  /** Income categories (FinanceEntry.category) counted in this stream.
   *  A category belongs to at most one stream. */
  categories: string[];
  /** Yearly target by calendar year: { "2026": 600000 }. */
  targets: Record<string, number>;
  sort_order: number;
  created_at: string;
}

export const STREAM_COLORS = ['#00A0A6', '#5F3DEB', '#D99A18', '#E23B6B', '#3B82F6', '#2E9E6B', '#F97316', '#8B5CF6'];
export const UNASSIGNED_COLOR = '#B8B3D6';
export const UNASSIGNED_ID = '__unassigned__';

export type PaceStatus = 'no_target' | 'achieved' | 'ahead' | 'slightly_behind' | 'behind' | 'missed' | 'upcoming';

export interface StreamProgress {
  id: string;
  name: string;
  color: string;
  categories: string[];
  target: number | null;
  earned: number;
  /** earned ÷ target as a whole-number %, uncapped (120 = beat it by 20%). Null without a target. */
  pct: number | null;
  remaining: number | null;
  /** What should be in by today if the target were earned evenly through the year. */
  expectedByNow: number | null;
  status: PaceStatus;
  /** Needed each remaining month (current month included) to still hit the target; null when not applicable. */
  perMonthNeeded: number | null;
  /** Jan..Dec income in this stream. */
  monthly: number[];
}

export interface StreamsOverview {
  year: number;
  /** Fraction of the year gone, 0..1 — where the "on pace" tick sits. */
  elapsed: number;
  streams: StreamProgress[];
  unassigned: StreamProgress | null;
  totalEarned: number;
  totalTarget: number | null;
  totalPct: number | null;
}

const norm = (s: string) => s.trim().toLowerCase();

export function yearElapsed(year: number, today: string): number {
  const y = Number(today.slice(0, 4));
  if (year < y) return 1;
  if (year > y) return 0;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const now = Date.UTC(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1); // end of today
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

function paceStatus(earned: number, target: number | null, elapsed: number): PaceStatus {
  if (!target || target <= 0) return 'no_target';
  if (earned >= target) return 'achieved';
  if (elapsed >= 1) return 'missed';
  if (elapsed <= 0) return 'upcoming';
  const expected = target * elapsed;
  if (earned >= expected) return 'ahead';
  return earned >= expected * 0.7 ? 'slightly_behind' : 'behind';
}

export function buildStreamsOverview(entries: FinanceEntry[], streams: IncomeStream[], year: number, today: string): StreamsOverview {
  const elapsed = yearElapsed(year, today);
  const income = entries.filter((e) => e.type === 'income' && e.date.startsWith(`${year}-`));

  // category (lower-cased) → owning stream. First stream wins if data ever has a clash.
  const owner = new Map<string, string>();
  for (const s of [...streams].sort((a, b) => a.sort_order - b.sort_order))
    for (const c of s.categories) if (!owner.has(norm(c))) owner.set(norm(c), s.id);

  const monthsLeft = elapsed >= 1 || elapsed <= 0 ? 0 : 12 - (Number(today.slice(5, 7)) - 1);
  const buckets = new Map<string, { monthly: number[]; earned: number; cats: Set<string> }>();
  const bucket = (id: string) => { let b = buckets.get(id); if (!b) { b = { monthly: Array(12).fill(0), earned: 0, cats: new Set() }; buckets.set(id, b); } return b; };
  for (const e of income) {
    const b = bucket(owner.get(norm(e.category)) ?? UNASSIGNED_ID);
    b.monthly[Number(e.date.slice(5, 7)) - 1]! += e.amount;
    b.earned += e.amount;
    b.cats.add(e.category);
  }

  const toProgress = (id: string, name: string, color: string, categories: string[], target: number | null): StreamProgress => {
    const b = buckets.get(id);
    const earned = b?.earned ?? 0;
    const t = target && target > 0 ? target : null;
    const status = paceStatus(earned, t, elapsed);
    return {
      id, name, color, categories, target: t, earned,
      pct: t ? Math.round((earned / t) * 100) : null,
      remaining: t ? Math.max(0, t - earned) : null,
      expectedByNow: t ? Math.round(t * elapsed) : null,
      status,
      perMonthNeeded: t && earned < t && monthsLeft > 0 ? Math.ceil((t - earned) / monthsLeft) : null,
      monthly: b?.monthly ?? Array(12).fill(0),
    };
  };

  const list = [...streams].sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => toProgress(s.id, s.name, s.color, s.categories, s.targets?.[String(year)] ?? null));

  const un = buckets.get(UNASSIGNED_ID);
  const unassigned = un && un.earned > 0 ? toProgress(UNASSIGNED_ID, 'Unassigned', UNASSIGNED_COLOR, [...un.cats].sort(), null) : null;

  const totalEarned = list.reduce((n, s) => n + s.earned, 0) + (unassigned?.earned ?? 0);
  const targets = list.map((s) => s.target).filter((t): t is number => t !== null);
  const totalTarget = targets.length ? targets.reduce((a, b) => a + b, 0) : null;
  // Progress against the combined target counts only income in streams that HAVE a target,
  // so un-targeted streams can't make a target look closer than it is.
  const earnedTowardTarget = list.filter((s) => s.target !== null).reduce((n, s) => n + s.earned, 0);
  return {
    year, elapsed, streams: list, unassigned, totalEarned, totalTarget,
    totalPct: totalTarget ? Math.round((earnedTowardTarget / totalTarget) * 100) : null,
  };
}

/** Distinct income categories seen in `entries`, plus the fixed labels the app itself posts. */
export function knownIncomeCategories(entries: FinanceEntry[], fixed: string[]): string[] {
  const seen = new Map<string, string>();
  for (const c of fixed) seen.set(norm(c), c);
  for (const e of entries) if (e.type === 'income' && e.category.trim()) if (!seen.has(norm(e.category))) seen.set(norm(e.category), e.category);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Move `categories` into stream `streamId`, taking them out of any other stream (a category has one home). */
export function assignCategories(streams: IncomeStream[], streamId: string, categories: string[]): IncomeStream[] {
  const wanted = new Map(categories.map((c) => [norm(c), c.trim()] as const).filter(([k]) => k));
  return streams.map((s) => s.id === streamId
    ? { ...s, categories: [...wanted.values()] }
    : { ...s, categories: s.categories.filter((c) => !wanted.has(norm(c))) });
}
