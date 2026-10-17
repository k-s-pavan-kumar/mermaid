import { table } from '@/lib/data';
import type { Alert, AlertState } from './types';
import type { Project, BountySubmission } from '@/features/projects/types';
import type { Invoice } from '@/features/billing/types';
import type { Task } from '@/features/today/types';
import { todayIso, shiftIso } from '@/lib/tz/today';
import { getDaySpend, weekStartOf, revenueIn } from '@/features/dashboard/queries';
import { getTargetsHistory, pickTargets } from '@/features/settings/queries';
import type { Client } from '@/features/clients/types';
import { retainerMonths, retainerSummary, daysBetweenIso } from '@/features/retainer/logic';

// Notifications are DERIVED from existing data rather than stored. Nothing
// writes an "alert" row — the rules below read the same tables the rest of
// the app uses, so an alert can never drift out of sync with the thing it
// describes, and dismissing/fixing the underlying record clears it for free.
// Add a new rule = add a block here; no schema change, no migration.

type DerivedAlert = Omit<Alert, 'read' | 'dismissed' | 'snoozedUntil'>;

function daysBetween(fromISO: string, to: Date): number {
  const from = new Date(fromISO + (fromISO.length === 10 ? 'T00:00:00' : ''));
  return Math.round((from.getTime() - to.getTime()) / 86_400_000);
}

const STALE_DAYS = 30;

async function deriveAlerts(ownerId: string): Promise<DerivedAlert[]> {
  const now = new Date();
  // Home-timezone day boundary, so nothing is flagged overdue an hour into
  // the morning just because the server clock is on UTC.
  const todayDate = todayIso();
  const today = new Date(todayDate + 'T00:00:00');

  const [projects, invoices, submissions, tasks] = await Promise.all([
    table<Project>('projects').where((p) => p.owner_id === ownerId),
    table<Invoice>('invoices').all(),
    table<BountySubmission>('bounty_submissions').all(),
    table<Task>('tasks').where((t) => t.owner_id === ownerId),
  ]);

  const ownedProjectIds = new Set(projects.map((p) => p.id));
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Project';
  const alerts: DerivedAlert[] = [];

  // 1. Invoices past their due date and still unpaid.
  for (const inv of invoices) {
    if (!inv.project_id || !ownedProjectIds.has(inv.project_id)) continue;
    if (inv.status === 'paid' || inv.status === 'draft' || !inv.due_at) continue;
    const d = daysBetween(inv.due_at, today);
    if (d < 0) {
      alerts.push({
        id: `inv-overdue-${inv.id}`,
        level: 'critical',
        title: `Invoice ${inv.number} is ${Math.abs(d)}d overdue`,
        detail: `${projectName(inv.project_id)} · ₹${inv.amount.toLocaleString('en-IN')}`,
        href: `/projects/${inv.project_id}?tab=billing`,
        daysOut: d,
      });
    } else if (d <= 7) {
      alerts.push({
        id: `inv-due-${inv.id}`,
        level: 'warning',
        title: `Invoice ${inv.number} due in ${d}d`,
        detail: `${projectName(inv.project_id)} · ₹${inv.amount.toLocaleString('en-IN')}`,
        href: `/projects/${inv.project_id}?tab=billing`,
        daysOut: d,
      });
    }
  }

  // 2. Bounty disclosure windows closing — these are hard deadlines.
  for (const s of submissions) {
    if (!ownedProjectIds.has(s.project_id) || !s.disclosure_deadline) continue;
    if (s.status === 'rejected' || s.status === 'duplicate') continue;
    const d = daysBetween(s.disclosure_deadline, today);
    if (d <= 14) {
      alerts.push({
        id: `bounty-${s.id}`,
        level: d <= 3 ? 'critical' : 'warning',
        title: d < 0 ? `Disclosure window closed ${Math.abs(d)}d ago` : `Disclosure window closes in ${d}d`,
        detail: `${s.program} · ${s.severity ?? 'unrated'}`,
        href: `/projects/${s.project_id}?tab=submissions`,
        daysOut: d,
      });
    }
  }

  // 3. Projects explicitly marked at risk.
  for (const p of projects) {
    if (p.status !== 'risk') continue;
    alerts.push({
      id: `risk-${p.id}`,
      level: 'warning',
      title: `${p.name} is flagged at risk`,
      detail: 'Marked at risk — worth a look or a status change.',
      href: `/projects/${p.id}`,
      daysOut: null,
    });
  }

  // 4. Active projects with no movement in a while.
  for (const p of projects) {
    if (p.status === 'done' || p.status === 'idea' || p.status === 'risk' || p.status === 'dropped') continue;
    const age = Math.abs(daysBetween(p.created_at.slice(0, 10), today));
    if (age >= STALE_DAYS) {
      alerts.push({
        id: `stale-${p.id}`,
        level: 'info',
        title: `${p.name} has been open ${age}d`,
        detail: 'Still active — close it out or re-scope if it has stalled.',
        href: `/projects/${p.id}`,
        daysOut: null,
      });
    }
  }

  // 5. Overdue scheduled tasks — never surfaced before now, so a task
  // scheduled three days ago and never finished was invisible unless you
  // happened to click back to that exact day.
  const overdueTasks = tasks.filter((t) => !t.done && t.scheduled_date && t.scheduled_date < todayDate);
  for (const t of overdueTasks) {
    const d = daysBetween(t.scheduled_date!, today);
    alerts.push({
      id: `task-overdue-${t.id}`,
      level: d <= -3 ? 'critical' : 'warning',
      title: `"${t.title}" was scheduled ${Math.abs(d)}d ago`,
      detail: t.project_id ? `${projectName(t.project_id)} · still not done` : 'Still not done',
      href: '/today',
      daysOut: d,
    });
  }

  // 6. Brain dump backing up — the ADHD-friendly nudge.
  const unscheduled = tasks.filter((t) => !t.scheduled_date && !t.done);
  if (unscheduled.length >= 8) {
    alerts.push({
      id: 'braindump-backlog',
      level: 'info',
      title: `${unscheduled.length} tasks sitting in the brain dump`,
      detail: 'Drag a few onto the timebox so they have a home.',
      href: '/today',
      daysOut: null,
    });
  }

  // 7. Weekly digest — last week's numbers against whatever target applied
  // that week, once the week is actually over. Keyed by the week's own
  // start date, so it's a one-time notification per week (dismiss it and
  // it's gone for good) rather than a recurring nag, and next Monday's
  // digest is automatically a different key. This is the closest thing to
  // a scheduled Monday email that a page-load-driven app without a cron
  // job can offer — it simply appears once the relevant Monday has come
  // and gone, the next time the workspace is opened.
  {
    const thisWeekStart = weekStartOf(todayDate);
    const lastWeekStart = shiftIso(thisWeekStart, -7);
    const lastWeekEnd = shiftIso(lastWeekStart, 6);

    const [lastWeekDays, history] = await Promise.all([
      getDaySpend(ownerId, lastWeekStart, lastWeekEnd),
      getTargetsHistory(ownerId),
    ]);
    const lastWeekTargets = pickTargets(history, lastWeekStart);
    const focusMinutes = lastWeekDays.reduce((n, d) => n + d.focusMinutes, 0);
    const tasksDone = lastWeekDays.reduce((n, d) => n + d.tasksDone, 0);
    const tasksPlanned = lastWeekDays.reduce((n, d) => n + d.tasksPlanned, 0);
    const activeDays = lastWeekDays.filter((d) => d.moved).length;
    const paid = revenueIn(
      invoices.filter((i) => !i.owner_id || i.owner_id === ownerId),
      new Map(),
      lastWeekStart, lastWeekEnd
    ).paid;
    const focusHours = Math.round((focusMinutes / 60) * 10) / 10;

    const hasTarget =
      lastWeekTargets.weekly_focus_hours > 0 || lastWeekTargets.weekly_tasks > 0 ||
      lastWeekTargets.weekly_active_days > 0 || lastWeekTargets.monthly_revenue > 0;
    const hadActivity = focusMinutes > 0 || tasksDone > 0 || paid > 0;

    // Nothing to report and nothing to compare against — skip rather than
    // notify about an empty week with no goal.
    if (hasTarget || hadActivity) {
      const parts: string[] = [];
      parts.push(
        lastWeekTargets.weekly_focus_hours > 0
          ? `Focused ${focusHours}h of ${lastWeekTargets.weekly_focus_hours}h target`
          : `Focused ${focusHours}h`
      );
      parts.push(
        lastWeekTargets.weekly_tasks > 0
          ? `${tasksDone}/${lastWeekTargets.weekly_tasks} tasks (${tasksPlanned} planned)`
          : `${tasksDone} tasks done`
      );
      if (paid > 0) parts.push(`${lastWeekTargets.currency} ${paid.toLocaleString('en-IN')} paid`);
      parts.push(`${activeDays}/7 active days`);

      const metFocus = lastWeekTargets.weekly_focus_hours === 0 || focusHours >= lastWeekTargets.weekly_focus_hours;
      const metTasks = lastWeekTargets.weekly_tasks === 0 || tasksDone >= lastWeekTargets.weekly_tasks;

      alerts.push({
        id: `weekly-digest-${lastWeekStart}`,
        level: 'info',
        title: hasTarget
          ? metFocus && metTasks
            ? `Last week: on target (${lastWeekStart} – ${lastWeekEnd})`
            : `Last week's digest (${lastWeekStart} – ${lastWeekEnd})`
          : `Last week's digest (${lastWeekStart} – ${lastWeekEnd})`,
        detail: parts.join(' · '),
        href: '/dashboard',
        daysOut: null,
      });
    }
  }

  // 8. Monthly retainer payments not received. Only active clients; one alert
  // per client. The id includes the overdue months, so a NEW missed month
  // raises a fresh alert even if an earlier one was dismissed.
  {
    const clients = await table<Client>('clients').where((c) => c.owner_id === ownerId && c.status === 'active' && c.billing_type === 'monthly');
    for (const c of clients) {
      const months = retainerMonths(c, invoices.filter((i) => i.client_id === c.id), todayDate);
      const overdue = months.filter((m) => m.state === 'overdue');
      if (overdue.length > 0) {
        const sum = retainerSummary(overdue).overdueTotal;
        alerts.push({
          id: `retainer-overdue-${c.id}-${overdue.map((m) => m.period).join('_')}`,
          level: overdue.length > 1 ? 'critical' : 'warning',
          title: `${c.name}: ${overdue.length} monthly payment${overdue.length > 1 ? 's' : ''} not received`,
          detail: `${overdue.map((m) => m.label).join(', ')} · ₹${sum.toLocaleString('en-IN')}`,
          href: `/clients/${c.id}?tab=retainer`,
          daysOut: -Math.max(...overdue.map((m) => daysBetweenIso(m.dueDate, todayDate))),
        });
      }
      const soon = months.find((m) => m.state === 'pending' && daysBetweenIso(todayDate, m.dueDate) <= 3);
      if (soon) {
        const d = daysBetweenIso(todayDate, soon.dueDate);
        alerts.push({
          id: `retainer-due-${c.id}-${soon.period}`,
          level: 'info',
          title: `${c.name}: ${soon.label} payment due ${d === 0 ? 'today' : `in ${d}d`}`,
          detail: `₹${soon.amount.toLocaleString('en-IN')} monthly retainer`,
          href: `/clients/${c.id}?tab=retainer`,
          daysOut: d,
        });
      }
    }
  }

  const rank: Record<Alert['level'], number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level] || (a.daysOut ?? 99) - (b.daysOut ?? 99));
}

/**
 * Public entry point: derive the alerts, then merge in each one's persisted
 * state. Dismissed and still-snoozed alerts are filtered out here rather
 * than in the rules, so a rule never has to know about user interaction.
 */
export async function getAlerts(ownerId: string, opts: { includeHidden?: boolean } = {}): Promise<Alert[]> {
  const [derived, states] = await Promise.all([
    deriveAlerts(ownerId),
    table<AlertState>('alert_states').where((s) => s.owner_id === ownerId),
  ]);

  const byKey = new Map(states.map((s) => [s.alert_key, s]));
  const now = Date.now();

  const merged: Alert[] = derived.map((d) => {
    const st = byKey.get(d.id);
    return {
      ...d,
      read: st?.read ?? false,
      dismissed: st?.dismissed ?? false,
      snoozedUntil: st?.snoozed_until ?? null,
    };
  });

  if (opts.includeHidden) return merged;

  return merged.filter((a) => {
    if (a.dismissed) return false;
    if (a.snoozedUntil && new Date(a.snoozedUntil).getTime() > now) return false;
    return true;
  });
}

/** Alerts the user has dismissed or snoozed — shown in a collapsed section. */
export async function getHiddenAlerts(ownerId: string): Promise<Alert[]> {
  const all = await getAlerts(ownerId, { includeHidden: true });
  const now = Date.now();
  return all.filter((a) => a.dismissed || (a.snoozedUntil && new Date(a.snoozedUntil).getTime() > now));
}

export async function getUnreadCount(ownerId: string): Promise<number> {
  const alerts = await getAlerts(ownerId);
  return alerts.filter((a) => !a.read).length;
}
