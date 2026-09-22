import { table } from '@/lib/data';
import { todayIso, shiftIso } from '@/lib/tz/today';
import { durationMinutes } from '@/features/today/time';
import { primaryType } from '@/lib/project-colors';
import { grandTotal, type Invoice } from '@/features/billing/types';
import { getInvoicePaidTotals } from '@/features/billing/queries';
import type { Task, FocusSession } from '@/features/today/types';
import type { Project, ProjectType, ProjectTargets } from '@/features/projects/types';
import type { Meeting } from '@/features/meetings/types';
import type { Targets, TargetsVersion, CategoryDef } from '@/features/settings/types';
import { pickTargets } from '@/features/settings/queries';
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
  /** Minutes actually worked, per project id — the input to per-project
   *  targets. Same avoid-double-counting rule as the category buckets. */
  projectMinutes: Record<string, number>;
}

/**
 * How a category is chosen for one task or focus session.
 *
 * A task's own `category` tag (set in Settings → assigned on the task) wins
 * when present — that's an explicit choice about how the person wants their
 * time read, and should override whatever project it happens to sit under.
 * A focus session without its own tag inherits its linked task's tag before
 * falling back to the project's type, so tagging a task once still shapes
 * every session logged against it.
 */
function taskCategory(t: Pick<Task, 'category' | 'project_id'>, typeOf: Map<string, ProjectType>): string {
  if (t.category) return t.category;
  return (t.project_id && typeOf.get(t.project_id)) || UNASSIGNED_KEY;
}

/**
 * How a day's 24 hours were spent, per day, over a date range.
 *
 * The one subtle decision here is avoiding double counting. A block on the
 * timebox and a focus session against that same project are usually the
 * *same* hour of your life recorded twice — once as an intention, once as
 * an outcome. So for each category:
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
 *
 * Per-project minutes (`projectMinutes`, for per-project targets) follow the
 * exact same avoid-double-counting rule, just keyed by project id instead of
 * by category — a project with no id (unassigned work) isn't included there,
 * since a target can't attach to "no project".
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
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const categoryForTask = (t: Task) => taskCategory(t, typeOf);
  const categoryForSession = (f: FocusSession): string => {
    if (f.category) return f.category;
    const linked = f.task_id ? taskById.get(f.task_id) : undefined;
    if (linked?.category) return linked.category;
    return (f.project_id && typeOf.get(f.project_id)) || UNASSIGNED_KEY;
  };

  const inRange = (d?: string | null): d is string => !!d && d >= from && d <= to;

  // Per day: focus minutes by category / by project, planned minutes by
  // category / by project, meetings.
  const focusByDay = new Map<string, Map<string, number>>();
  const plannedByDay = new Map<string, Map<string, number>>();
  const focusByDayProject = new Map<string, Map<string, number>>();
  const plannedByDayProject = new Map<string, Map<string, number>>();
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
    bump(focusByDay, f.date, categoryForSession(f), Math.max(0, f.completed_minutes));
    if (f.project_id) bump(focusByDayProject, f.date, f.project_id, Math.max(0, f.completed_minutes));
  }

  for (const t of tasks) {
    if (!inRange(t.scheduled_date)) continue;
    plannedCountByDay.set(t.scheduled_date, (plannedCountByDay.get(t.scheduled_date) ?? 0) + 1);
    if (t.done) doneByDay.set(t.scheduled_date, (doneByDay.get(t.scheduled_date) ?? 0) + 1);
    // Only tasks actually placed on the grid represent a claim on time;
    // something still sitting in the brain dump has no hour attached to it.
    if (t.scheduled_hour === null || t.scheduled_hour === undefined) continue;
    bump(plannedByDay, t.scheduled_date, categoryForTask(t), durationMinutes(t));
    if (t.project_id) bump(plannedByDayProject, t.scheduled_date, t.project_id, durationMinutes(t));
  }

  for (const m of meetings) {
    const day = m.starts_at.slice(0, 10);
    if (!inRange(day)) continue;
    meetingByDay.set(day, (meetingByDay.get(day) ?? 0) + Math.max(0, m.duration_mins || 0));
  }

  const reconcile = (focus: Map<string, number>, planned: Map<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const key of new Set([...focus.keys(), ...planned.keys()])) {
      const f = focus.get(key) ?? 0;
      const p = planned.get(key) ?? 0;
      const minutes = f + Math.max(0, p - f);
      if (minutes > 0) out[key] = minutes;
    }
    return out;
  };

  const out: DaySpend[] = [];
  for (let d = from; d <= to; d = shiftIso(d, 1)) {
    const focus = focusByDay.get(d) ?? new Map<string, number>();
    const planned = plannedByDay.get(d) ?? new Map<string, number>();
    const meetingMinutes = meetingByDay.get(d) ?? 0;

    const buckets = reconcile(focus, planned);
    if (meetingMinutes > 0) buckets[MEETINGS_KEY] = meetingMinutes;

    const projectMinutes = reconcile(
      focusByDayProject.get(d) ?? new Map<string, number>(),
      plannedByDayProject.get(d) ?? new Map<string, number>()
    );

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
      projectMinutes,
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

/** Collapse a run of days into one project id → minutes map. */
export function sumProjectMinutes(days: DaySpend[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(d.projectMinutes)) total[k] = (total[k] ?? 0) + v;
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

/**
 * Revenue for a date range.
 *
 * Paid invoices are dated by `paid_at` when it's set — that's when the money
 * actually landed, which is the question a financial goal is asking. Anything
 * else falls back to `issued_at`. Drafts are excluded entirely: an unsent
 * invoice is an intention, not income. A partially-paid invoice contributes
 * only what's actually landed (from `paidTotals`) to `paid`, and the rest to
 * `outstanding` — the same bucket it would have landed in whole before
 * partial payments existed.
 */
export function revenueIn(invoices: Invoice[], paidTotals: Map<string, number>, from: string, to: string): RevenueSlice {
  let paid = 0;
  let outstanding = 0;

  for (const inv of invoices) {
    if (inv.status === 'draft') continue;
    const total = grandTotal(inv);
    const received = inv.status === 'paid' ? total : inv.status === 'partial' ? Math.min(total, paidTotals.get(inv.id) ?? 0) : 0;
    const when = inv.status === 'paid' ? inv.paid_at ?? inv.issued_at : inv.issued_at;
    if (!when || when < from || when > to) continue;
    paid += received;
    outstanding += Math.max(0, total - received);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return { paid: round(paid), outstanding: round(outstanding), invoiced: round(paid + outstanding) };
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

export interface Streaks {
  /** Consecutive days up to and including today (or yesterday, if nothing
   *  has happened yet today) on which something moved. */
  current: number;
  /** The longest such run within the lookback window. */
  longest: number;
  longestStart: string | null;
  longestEnd: string | null;
  /** How far back this was actually computed — so the UI can be honest that
   *  "longest" means "longest in the last N days", not "of all time", if the
   *  account is older than the window. */
  windowDays: number;
}

const STREAK_WINDOW_DAYS = 400;

/**
 * Current and longest streaks of "active" days — the same forgiving
 * definition DaySpend.moved uses (a finished task, a focus session, or a
 * meeting all count).
 *
 * Bounded to a rolling window rather than the account's entire history:
 * walking every day since account creation gets more expensive the longer
 * someone has used the app, for a number that stops being meaningful past a
 * year or so anyway. 400 days comfortably covers "did I keep this up all
 * year" while staying a single bounded query.
 */
export async function getStreaks(ownerId: string, today: string): Promise<Streaks> {
  const from = shiftIso(today, -(STREAK_WINDOW_DAYS - 1));
  const days = await getDaySpend(ownerId, from, today);
  const movedByDate = new Map(days.map((d) => [d.date, d.moved]));

  // Current streak: walk backward from today. If today itself has nothing
  // yet (the day isn't over), that shouldn't zero out a real streak, so
  // start from yesterday when today is empty.
  let cursor = movedByDate.get(today) ? today : shiftIso(today, -1);
  let current = 0;
  while (movedByDate.get(cursor)) {
    current += 1;
    cursor = shiftIso(cursor, -1);
  }

  // Longest streak anywhere in the window.
  let longest = 0;
  let longestStart: string | null = null;
  let longestEnd: string | null = null;
  let runStart: string | null = null;
  let run = 0;
  for (const d of days) {
    if (d.moved) {
      if (run === 0) runStart = d.date;
      run += 1;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = d.date;
      }
    } else {
      run = 0;
      runStart = null;
    }
  }

  return { current, longest, longestStart, longestEnd, windowDays: STREAK_WINDOW_DAYS };
}

// ---------------------------------------------------------------------------
// Per-project targets
// ---------------------------------------------------------------------------

export interface ProjectProgress {
  projectId: string;
  projectName: string;
  targets: ProjectTargets;
  weekFocusHours: number;
  monthFocusHours: number;
}

/** Projects that have a per-project target set, with this week's and this
 *  month's actual focused hours against them. */
export function projectProgressFrom(
  projects: Project[],
  weekMinutesByProject: Record<string, number>,
  monthMinutesByProject: Record<string, number>
): ProjectProgress[] {
  return projects
    .filter((p) => (p.targets?.weekly_focus_hours ?? 0) > 0 || (p.targets?.monthly_focus_hours ?? 0) > 0)
    .map((p) => ({
      projectId: p.id,
      projectName: p.name,
      targets: { weekly_focus_hours: p.targets?.weekly_focus_hours ?? 0, monthly_focus_hours: p.targets?.monthly_focus_hours ?? 0 },
      weekFocusHours: Math.round(((weekMinutesByProject[p.id] ?? 0) / 60) * 10) / 10,
      monthFocusHours: Math.round(((monthMinutesByProject[p.id] ?? 0) / 60) * 10) / 10,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
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
  /**
   * The targets that actually applied during this period — picked from
   * targets_history using the period's own start date, not "whatever the
   * targets are today". A week in June is judged against June's targets
   * even if they've changed three times since.
   */
  targets: Targets;
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
  /** Targets in effect today — used for the "no targets set" banner and as
   *  the default currency/fiscal-month for money formatting. Period-specific
   *  progress uses its own `targets` field instead of this. */
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
  streaks: Streaks;
  projectProgress: ProjectProgress[];
}

function progress(
  label: string,
  start: string,
  end: string,
  today: string,
  days: DaySpend[],
  revenue: RevenueSlice,
  targets: Targets
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
    targets,
  };
}

/**
 * Assemble the whole Dashboard for one owner.
 *
 * Takes the full targets history (not a single Targets object) so each
 * period can be judged against whatever targets actually applied when that
 * period happened, and the workspace's custom category definitions so the
 * legend can label and colour them correctly.
 */
export async function getDashboard(
  ownerId: string,
  targetsHistory: TargetsVersion[],
  customCategories: CategoryDef[] = []
): Promise<DashboardData> {
  const today = todayIso();
  const todaysTargets = pickTargets(targetsHistory, today);
  const fy = fiscalYearOf(today, todaysTargets.fiscal_year_start_month || 1);

  // One pass over the whole financial year; the week and month views are
  // slices of it rather than three separate scans of the same tables.
  const [yearDays, invoices, projects, paidTotals] = await Promise.all([
    getDaySpend(ownerId, fy.start, fy.end),
    table<Invoice>('invoices').all(),
    table<Project>('projects').where((p) => p.owner_id === ownerId),
    getInvoicePaidTotals(ownerId),
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
  const monthDays = slice(monthStart, monthEnd);

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
      revenue: revenueIn(mine, paidTotals, m, end),
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
    .map((k) => categoryMeta(k, customCategories));

  const [streaks, projectMinutesWeek, projectMinutesMonth] = [
    await getStreaks(ownerId, today),
    sumProjectMinutes(weekDays),
    sumProjectMinutes(monthDays),
  ];

  return {
    today,
    targets: todaysTargets,
    week: progress(
      'This week', weekStart, weekEnd, today, weekDays,
      revenueIn(mine, paidTotals, weekStart, weekEnd), pickTargets(targetsHistory, weekStart)
    ),
    month: progress(
      'This month', monthStart, monthEnd, today, monthDays,
      revenueIn(mine, paidTotals, monthStart, monthEnd), pickTargets(targetsHistory, monthStart)
    ),
    year: {
      ...progress(
        'This year', fy.start, fy.end, today, yearDays,
        revenueIn(mine, paidTotals, fy.start, fy.end), pickTargets(targetsHistory, today)
      ),
      label: fy.label,
    },
    monthDays,
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
        projectMinutes: {},
      },
    months,
    categories,
    streaks,
    projectProgress: projectProgressFrom(projects, projectMinutesWeek, projectMinutesMonth),
  };
}
