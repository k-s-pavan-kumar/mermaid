import { table, writeDb } from '../src/lib/data/local-store';
import { getOverdueTasks } from '../src/features/today/queries';
import { getAlerts } from '../src/features/notifications/queries';
import type { Task } from '../src/features/today/types';

const OWNER = 'test@example.com';
function assert(c: unknown, m: string) {
  if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m);
}
const empty = { clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
  bounty_submissions: [], project_metrics: [], milestones: [], notes: [], tasks: [],
  integrations: [], alert_states: [] };

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function main() {
  await table<Task>('tasks').insert({
    id: 't_overdue1', owner_id: OWNER, project_id: null, title: 'From yesterday, not done',
    dump_date: yesterday, scheduled_date: yesterday, scheduled_hour: 9, duration_hours: 1,
    done: false, created_at: yesterday + 'T09:00:00.000Z',
  });
  await table<Task>('tasks').insert({
    id: 't_overdue2', owner_id: OWNER, project_id: null, title: 'From 4 days ago, not done',
    dump_date: fourDaysAgo, scheduled_date: fourDaysAgo, scheduled_hour: 9, duration_hours: 1,
    done: false, created_at: fourDaysAgo + 'T09:00:00.000Z',
  });
  // done in the past — must NOT be overdue
  await table<Task>('tasks').insert({
    id: 't_done_past', owner_id: OWNER, project_id: null, title: 'From yesterday, but done',
    dump_date: yesterday, scheduled_date: yesterday, scheduled_hour: 9, duration_hours: 1,
    done: true, created_at: yesterday + 'T09:00:00.000Z',
  });
  // scheduled today, not done — must NOT be overdue (today's task, not late yet)
  await table<Task>('tasks').insert({
    id: 't_today', owner_id: OWNER, project_id: null, title: 'Scheduled today',
    dump_date: today, scheduled_date: today, scheduled_hour: 14, duration_hours: 1,
    done: false, created_at: new Date().toISOString(),
  });
  // scheduled in the future — must NOT be overdue
  await table<Task>('tasks').insert({
    id: 't_future', owner_id: OWNER, project_id: null, title: 'Scheduled tomorrow',
    dump_date: today, scheduled_date: tomorrow, scheduled_hour: 9, duration_hours: 1,
    done: false, created_at: new Date().toISOString(),
  });
  // unscheduled — must NOT be overdue (it's in the brain dump, not late)
  await table<Task>('tasks').insert({
    id: 't_unscheduled', owner_id: OWNER, project_id: null, title: 'Still in brain dump',
    dump_date: fourDaysAgo, scheduled_date: null, scheduled_hour: null, duration_hours: 1,
    done: false, created_at: fourDaysAgo + 'T09:00:00.000Z',
  });

  const overdue = await getOverdueTasks(OWNER, today);
  const ids = overdue.map((t) => t.id);
  console.log('   overdue:', ids.join(', '));

  assert(ids.length === 2, `exactly 2 overdue tasks (got ${ids.length})`);
  assert(ids.includes('t_overdue1') && ids.includes('t_overdue2'), 'both genuinely overdue tasks are found');
  assert(!ids.includes('t_done_past'), 'a completed past task is NOT overdue');
  assert(!ids.includes('t_today'), "today's own task is NOT overdue (it's not late yet)");
  assert(!ids.includes('t_future'), 'a future-scheduled task is NOT overdue');
  assert(!ids.includes('t_unscheduled'), 'an unscheduled brain-dump task is NOT overdue (nothing to be late for)');
  assert(ids[0] === 't_overdue2', 'oldest overdue task sorts first (4 days ago before 1 day ago)');

  // Notification rule consistency: the same tasks must also surface as alerts.
  const alerts = await getAlerts(OWNER);
  const alertIds = alerts.map((a) => a.id);
  assert(alertIds.includes('task-overdue-t_overdue1'), 'overdue task also raises a notification alert');
  assert(alertIds.includes('task-overdue-t_overdue2'), 'the older overdue task raises a notification too');
  const older = alerts.find((a) => a.id === 'task-overdue-t_overdue2')!;
  assert(older.level === 'critical', `4-days-overdue task alerts as critical (got "${older.level}")`);
  const newer = alerts.find((a) => a.id === 'task-overdue-t_overdue1')!;
  assert(newer.level === 'warning', `1-day-overdue task alerts as warning (got "${newer.level}")`);

  writeDb(empty);
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
