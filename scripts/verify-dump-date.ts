import { table, writeDb } from '../src/lib/data/local-store';
import { getBrainDump, getBrainDumpGrouped } from '../src/features/today/queries';
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
const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

async function main() {
  await table<Task>('tasks').insert({
    id: 't_today', owner_id: OWNER, project_id: null, title: 'Dumped today',
    dump_date: today, scheduled_date: null, scheduled_hour: null, duration_hours: 1,
    done: false, created_at: new Date().toISOString(),
  });
  await table<Task>('tasks').insert({
    id: 't_yesterday', owner_id: OWNER, project_id: null, title: 'Dumped yesterday',
    dump_date: yesterday, scheduled_date: null, scheduled_hour: null, duration_hours: 1,
    done: false, created_at: yesterday + 'T09:00:00.000Z',
  });
  await table<Task>('tasks').insert({
    id: 't_lastweek', owner_id: OWNER, project_id: null, title: 'Dumped last week',
    dump_date: lastWeek, scheduled_date: null, scheduled_hour: null, duration_hours: 1,
    done: false, created_at: lastWeek + 'T09:00:00.000Z',
  });
  // Simulate a row written before dump_date existed (no field at all).
  await table<Task>('tasks').insert({
    id: 't_legacy', owner_id: OWNER, project_id: null, title: 'Old row, no dump_date',
    scheduled_date: null, scheduled_hour: null, duration_hours: 1,
    done: false, created_at: lastWeek + 'T09:00:00.000Z',
  } as unknown as Task);
  // A scheduled task must NEVER appear in the brain dump, regardless of dump_date.
  await table<Task>('tasks').insert({
    id: 't_scheduled', owner_id: OWNER, project_id: null, title: 'Already scheduled',
    dump_date: today, scheduled_date: today, scheduled_hour: 10, duration_hours: 1,
    done: false, created_at: new Date().toISOString(),
  });

  const flat = await getBrainDump(OWNER);
  assert(flat.length === 4, `4 unscheduled tasks in the flat list (got ${flat.length})`);
  assert(!flat.some((t) => t.id === 't_scheduled'), 'a scheduled task never leaks into the brain dump');

  const grouped = await getBrainDumpGrouped(OWNER);
  const dates = grouped.map((g) => g.date);
  console.log('   groups:', dates.join(', '));

  assert(dates.length === 3, `3 distinct date groups — legacy row correctly merges into last week's (got ${dates.length})`);
  assert(dates[0] === lastWeek, 'oldest date group sorts first (a real backlog reads oldest-first)');
  assert(dates[dates.length - 1] === today, 'today sorts last');
  assert(dates.includes(lastWeek), 'the legacy row without dump_date falls back to created_at\'s date, not lost or crashed');

  const todayGroup = grouped.find((g) => g.date === today)!;
  assert(todayGroup.tasks.length === 1 && todayGroup.tasks[0]!.id === 't_today', 'today\'s group contains exactly the task dumped today');

  const lastWeekGroup = grouped.find((g) => g.date === lastWeek)!;
  assert(lastWeekGroup.tasks.length === 2, `both the explicit and legacy last-week tasks group together (got ${lastWeekGroup.tasks.length})`);

  writeDb(empty);
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
