import { table } from '@/lib/data';
import { todayIso, shiftIso } from '@/lib/tz/today';
import { durationMinutes } from '@/features/today/time';
import { primaryType } from '@/lib/project-colors';
import { grandTotal, type Invoice } from '@/features/billing/types';
import type { Task, FocusSession } from '@/features/today/types';
import type { Project, ProjectType } from '@/features/projects/types';
import type { Meeting } from '@/features/meetings/types';
import type { Targets } from '@/features/settings/types';
import {
  MINUTES_PER_DAY, MEETINGS_KEY, UNASSIGNED_KEY, UNTRACKED_KEY,
  categoryMeta, type CategoryMeta,
} from './constants';

/**
 * Everything the Dashboard shows, computed from records that already exist.
 *
 * Nothing here asks the user to log anything new: focus sessions, scheduled
 * task blocks, meetings and invoices are all already being written by the
 * Today board, the calendar and Billing. The Dashboard is a second reading
 * of that same data, at week / month / year scale.
 */

export {
  MINUTES_PER_DAY, MEETINGS_KEY, UNASSIGNED_KEY, UNTRACKED_KEY,
  EXTRA_CATEGORIES, categoryMeta,
} from './constants';
export type { CategoryMeta } from './constants';

/** Minutes per category for one calendar day. */
export interface DaySpend {
  date: string;
  /** Category key → minutes. Always sums to 1440 (the remainder is
   *  UNTRACKED_KEY), so a pie of it really is "a 24-hour day". */
  buckets: Record<string, number>;
  /** Minutes that came from a real record, i.e. 1440 − untracked. */
  trackedMinutes: number;
  focusMinutes: number;
  meetingMinutes: number;
  plannedMinutes: number;
  tasksDone: number;
  tasksPlanned: number;
  /** Did anything at all happen? Same forgiving definition as the streak. */
  moved: boolean;
}

/**
 * How a day's 24 hours were spent, per day, over a date range.
 *
 * The one subtle decision here is avoiding double counting. A block on the
 * timebox and a focus session against that same project are usually the
 * *same* hour of your life recorded twice — once as an intention, once as
 * an outcome. So for each project category:
 *
 *     minutes = focus minutes
 *             + max(0, planned block minutes − focus minutes)
 *
 * i.e. a timer that ran counts as itself, and a planned block only
 * contributes whatever it claimed *beyond* what the timer already covered.
 * Meetings are counted separately because they're genuinely additional time.
 * Whatever is left of the 1440 becomes "unaccounted" rather than being
 * silently dropped — a day where you tracked three hours should look like a
 * day where you tracked three hours.
 */
export async function getDaySpend(
  ownerId: string,
  from: string,
  to: string
): Promise<DaySpend[]> {
  const [tasks, sessions, meetings, projects] = await Promise.all([
    table<Task>('tasks').where((t) => t.owner_id === ownerId),
    table<FocusSession>('focus_sessions').where((f) => f.owner_id === ownerId),
    table<Meeting>('meetings').where((m) => m.owner_id === ownerId),
    table<Project>('projects').where((p) => p.owner_id === ownerId),
  ]);

  const typeOf = new Map<string, ProjectType>(projects.map((p) => [p.id, primaryType(p)]));
  const categoryFor = (projectId: string | null | undefined): string =>
    (projectId && typeOf.get(projectId)) || UNASSIGNED_KEY;

  const inRange = (d?: string | null): d is string => !!d && d >= from && d <= to;

  // Per day: focus minutes by category, planned minutes by category, meetings.
  const focusByDay = new Map<string, Map<string, number>>();
  const plannedByDay = new Map<string, Map<string, number>>();
  const meetingByDay = new Map<string, number>();
  const doneByDay = new Map<string, number>();
  const plannedCountByDay = new Map<string, number>();

  const bump = (m: Map<string, Map<string, number>>, day: string, key: string, n: number) => {
    const inner = m.get(day) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + n);
    m.set(day, inner);
  };

  for (const f of sessions) {
    if (!inRange(f.date)) continue;
    bump(focusByDay, f.date, categoryFor(f.project_id), Math.max(0, f.completed_minutes));
  }

  for (const t of tasks) {
    if (!inRange(t.scheduled_date)) continue;
    plannedCountByDay.set(t.scheduled_date, (plannedCountByDay.get(t.scheduled_date) ?? 0) + 1);
    if (t.done) doneByDay.set(t.scheduled_date, (doneByDay.get(t.scheduled_date) ?? 0) + 1);
    // Only tasks actually placed on the grid represent a claim on time;
    // something still sitting in the brain dump has no hour attached to it.
    if (t.scheduled_hour === null || t.scheduled_hour === undefined) continue;
    bump(plannedByDay, t.scheduled_date, categoryFor(t.project_id), durationMinutes(t));
  }

  for (const m of meetings) {
    const day = m.starts_at.slice(0, 10);
    if (!inRange(day)) continue;
    meetingByDay.set(day, (meetingByDay.get(day) ?? 0) + Math.max(0, m.duration_mins || 0));
  }

  const out: DaySpend[] = [];
  for (let d = from; d <= to; d = shiftIso(d, 1)) {
    const focus = focusByDay.get(d) ?? new Map<string, number>();
    const planned = plannedByDay.get(d) ?? new Map<string, number>();
    const meetingMinutes = meetingByDay.get(d) ?? 0;

    const buckets: Record<string, number> = {};
    for (const key of new Set([...focus.keys(), ...planned.keys()])) {
      const f = focus.get(key) ?? 0;
      const p = planned.get(key) ?? 0;
      const minutes = f + Math.max(0, p - f);
      if (minutes > 0) buckets[key] = minutes;
    }
    if (meetingMinutes > 0) buckets[MEETINGS_KEY] = meetingMinutes;

    const focusMinutes = [...focus.values()].reduce((a, b) => a + b, 0);
    const plannedMinutes = [...planned.values()].reduce((a, b) => a + b, 0);
    let tracked = Object.values(buckets).reduce((a, b) => a + b, 0);

    // A day cannot contain more than 24 hours. If overlapping records claim
    // more, scale them down proportionally rather than letting the pie lie.
    if (tracked > MINUTES_PER_DAY) {
      const scale = MINUTES_PER_DAY / tracked;
      for (const k of Object.keys(buckets)) buckets[k] = Math.round((buckets[k] ?? 0) * scale);
      tracked = MINUTES_PER_DAY;
    }
    buckets[UNTRACKED_KEY] = Math.max(0, MINUTES_PER_DAY - tracked);

    const tasksDone = doneByDay.get(d) ?? 0;
    out.push({
      date: d,
      buckets,
      trackedMinutes: tracked,
      focusMinutes,
      meetingMinutes,
      plannedMinutes,
      tasksDone,
      tasksPlanned: plannedCountByDay.get(d) ?? 0,
      moved: tasksDone > 0 || focusMinutes > 0 || meetingMinutes > 0,
    });
  }

  return out;
}

/** Collapse a run of days into one category → minutes map. */
export function sumBuckets(days: DaySpend[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(d.buckets)) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}

/** An average *day* across a run of days — the shape the 24-hour pie wants
 *  when you ask "how does a typical day in this month go". */
export function averageDay(days: DaySpend[]): Record<string, number> {
  if (days.length === 0) return { [UNTRACKED_KEY]: MINUTES_PER_DAY };
  const total = sumBuckets(days);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(total)) out[k] = v / days.length;
  return out;
}

// ---------------------------------------------------------------------------
// Date-range helpers
// ---------------------------------------------------------------------------

/** Monday of the week containing `iso`. Weeks start Monday here because the
 *  rest of the app's calendars do. */
export function weekStartOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const offset = (d.getUTCDay() + 6) % 7;
  return shiftIso(iso, -offset);
}

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEndOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/**
 * The financial year containing `iso`, honouring a non-January start month.
 * With fiscal_year_start_month = 4, 2026-02-11 belongs to the year that runs
 * 2025-04-01 → 2026-03-31.
 */
export function fiscalYearOf(iso: string, startMonth: number): { start: string; end: string; label: string } {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endMonthIndex = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const lastDay = new Date(Date.UTC(endYear, endMonthIndex, 0)).getUTCDate();
  const end = `${endYear}-${String(endMonthIndex).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const label = startMonth === 1 ? String(startYear) : `${startYear}–${String(endYear).slice(2)}`;
  return { start, end, label };
}

/** The 12 month-starts of a financial year, in order. */
export function fiscalMonths(start: string): string[] {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = (m ?? 1) - 1 + i;
    const year = (y ?? 1970) + Math.floor(monthIndex / 12);
    return `${year}-${String((monthIndex % 12) + 1).padStart(2, '0')}-01`;
  });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000) + 1;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface RevenueSlice {
  /** Paid and banked. */
  paid: number;
  /** Issued and not yet paid — real work done, money still owed. */
  outstanding: number;
  /** paid + outstanding, i.e. everything billed that isn't a draft. */
  invoiced: number;
}

const EMPTY_REVENUE: RevenueSlice = { paid: 0, outstanding: 0, invoiced: 0 };

/**
 * Revenue for a date range.
 *
 * Paid invoices are dated by `paid_at` when it's set — that's when the money
 * actually landed, which is the question a financial goal is asking. Anything
 * else falls back to `issued_at`. Drafts are excluded entirely: an unsent
 * invoice is an intention, not income.
 */
export function revenueIn(invoices: Invoice[], from: string, to: string): RevenueSlice {
  let paid = 0;
  let outstanding = 0;

  for (const inv of invoices) {
    if (inv.status === 'draft') continue;
    const total = grandTotal(inv);
    const when = inv.status === 'paid' ? inv.paid_at ?? inv.issued_at : inv.issued_at;
    if (!when || when < from || when > to) continue;
    if (inv.status === 'paid') paid += total;
    else outstanding += total;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return { paid: round(paid), outstanding: round(outstanding), invoiced: round(paid + outstanding) };
}

// ---------------------------------------------------------------------------
// The assembled dashboard
// ---------------------------------------------------------------------------

export interface PeriodProgress {
  label: string;
  start: string;
  end: string;
  /** 0-1: how far through the period we are, by elapsed days. */
  elapsed: number;
  daysElapsed: number;
  daysTotal: number;
  focusHours: number;
  tasksDone: number;
  tasksPlanned: number;
  activeDays: number;
  meetingHours: number;
  revenue: RevenueSlice;
}

export interface MonthSpread {
  /** 'YYYY-MM-01' */
  month: string;
  label: string;
  buckets: Record<string, number>;
  focusHours: number;
  tasksDone: number;
  activeDays: number;
  revenue: RevenueSlice;
  /** Is this month in the future relative to today? */
  future: boolean;
}

export interface DashboardData {
  today: string;
  targets: Targets;
  week: PeriodProgress;
  month: PeriodProgress;
  year: PeriodProgress & { label: string };
  /** Per-day rows for the current month — powers the day picker and the
   *  month-wise spread strip. */
  monthDays: DaySpend[];
  /** Today's own 24 hours. */
  todaySpend: DaySpend;
  /** Every month of the financial year. */
  months: MonthSpread[];
  /** Categories actually present across the year, for a stable legend. */
  categories: CategoryMeta[];
}

function progress(
  label: string,
  start: string,
  end: string,
  today: string,
  days: DaySpend[],
  revenue: RevenueSlice
): PeriodProgress {
  const daysTotal = daysBetween(start, end);
  const daysElapsed = Math.max(0, Math.min(daysTotal, daysBetween(start, today > end ? end : today)));
  const focusMinutes = days.reduce((n, d) => n + d.focusMinutes, 0);
  const meetingMinutes = days.reduce((n, d) => n + d.meetingMinutes, 0);

  return {
    label,
    start,
    end,
    daysTotal,
    daysElapsed,
    elapsed: daysTotal > 0 ? daysElapsed / daysTotal : 0,
    focusHours: Math.round((focusMinutes / 60) * 10) / 10,
    meetingHours: Math.round((meetingMinutes / 60) * 10) / 10,
    tasksDone: days.reduce((n, d) => n + d.tasksDone, 0),
    tasksPlanned: days.reduce((n, d) => n + d.tasksPlanned, 0),
    activeDays: days.filter((d) => d.moved).length,
    revenue,
  };
}

export async function getDashboard(ownerId: string, targets: Targets): Promise<DashboardData> {
  const today = todayIso();
  const fy = fiscalYearOf(today, targets.fiscal_year_start_month || 1);

  // One pass over the whole financial year; the week and month views are
  // slices of it rather than three separate scans of the same tables.
  const [yearDays, invoices] = await Promise.all([
    getDaySpend(ownerId, fy.start, fy.end),
    table<Invoice>('invoices').all(),
  ]);
  const mine = invoices.filter((i) => !i.owner_id || i.owner_id === ownerId);

  const byDate = new Map(yearDays.map((d) => [d.date, d]));
  const slice = (from: string, to: string) => yearDays.filter((d) => d.date >= from && d.date <= to);

  const weekStart = weekStartOf(today);
  const weekEnd = shiftIso(weekStart, 6);
  const monthStart = monthStartOf(today);
  const monthEnd = monthEndOf(today);

  // The current week can straddle the financial-year boundary, in which case
  // yearDays doesn't cover all of it — fetch the remainder rather than
  // silently reporting a short week.
  const weekDays =
    weekStart >= fy.start && weekEnd <= fy.end
      ? slice(weekStart, weekEnd)
      : await getDaySpend(ownerId, weekStart, weekEnd);

  const months: MonthSpread[] = fiscalMonths(fy.start).map((m) => {
    const end = monthEndOf(m);
    const days = slice(m, end);
    return {
      month: m,
      label: new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      buckets: sumBuckets(days),
      focusHours: Math.round((days.reduce((n, d) => n + d.focusMinutes, 0) / 60) * 10) / 10,
      tasksDone: days.reduce((n, d) => n + d.tasksDone, 0),
      activeDays: days.filter((d) => d.moved).length,
      revenue: revenueIn(mine, m, end),
      future: m > today,
    };
  });

  // Stable legend: every category that appears anywhere in the year, in a
  // fixed order, so colours don't shuffle as you page between months.
  const seen = new Set<string>();
  for (const m of months) for (const k of Object.keys(m.buckets)) seen.add(k);
  seen.add(UNTRACKED_KEY);
  const categories = [...seen]
    .filter((k) => k !== UNTRACKED_KEY)
    .sort()
    .concat(UNTRACKED_KEY)
    .map(categoryMeta);

  return {
    today,
    targets,
    week: progress('This week', weekStart, weekEnd, today, weekDays, revenueIn(mine, weekStart, weekEnd)),
    month: progress('This month', monthStart, monthEnd, today, slice(monthStart, monthEnd), revenueIn(mine, monthStart, monthEnd)),
    year: { ...progress('This year', fy.start, fy.end, today, yearDays, revenueIn(mine, fy.start, fy.end)), label: fy.label },
    monthDays: slice(monthStart, monthEnd),
    todaySpend:
      byDate.get(today) ?? {
        date: today,
        buckets: { [UNTRACKED_KEY]: MINUTES_PER_DAY },
        trackedMinutes: 0,
        focusMinutes: 0,
        meetingMinutes: 0,
        plannedMinutes: 0,
        tasksDone: 0,
        tasksPlanned: 0,
        moved: false,
      },
    months,
    categories,
  };
}
