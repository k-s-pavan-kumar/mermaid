import { table, writeDb } from '../src/lib/data/local-store';
import { getBrainDump, getTasksForDate, getTasksForProject } from '../src/features/today/queries';
import type { Task } from '../src/features/today/types';
import type { Project } from '../src/features/projects/types';

const OWNER = 'test@example.com';
function assert(c: unknown, m: string) {
  if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m);
}
const empty = { clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
  bounty_submissions: [], project_metrics: [], milestones: [], notes: [], tasks: [],
  integrations: [], alert_states: [] };

async function main() {
  await table<Project>('projects').insert({
    id: 'p1', owner_id: OWNER, name: 'Zooli', type: 'client', client_id: null,
    status: 'ontrack', description: null, created_at: new Date().toISOString(),
  });

  // A task created via the project's own "Add a task" form (project_id set,
  // unscheduled) must show up in Today's brain dump, badge-ready.
  const task = await table<Task>('tasks').insert({
    id: 't1', owner_id: OWNER, project_id: 'p1', title: 'Ship the thing',
    scheduled_date: null, scheduled_hour: null, duration_hours: 1, done: false,
    created_at: new Date().toISOString(),
  });

  let dump = await getBrainDump(OWNER);
  assert(dump.some((t) => t.id === task.id), 'task added from a project appears in the Today brain dump');

  let projTasks = await getTasksForProject('p1');
  assert(projTasks.length === 1 && projTasks[0]!.id === task.id, 'the same task appears in the project to-do list');

  // Scheduling it from "Today" (simulated directly via table update, same
  // as the scheduleTask action does) must be visible from the project side.
  await table<Task>('tasks').update(task.id, { scheduled_date: '2026-09-20', scheduled_hour: 10, duration_hours: 2 });

  const forDate = await getTasksForDate(OWNER, '2026-09-20');
  assert(forDate.some((t) => t.id === task.id && t.duration_hours === 2), 'scheduling + resizing from Today is reflected immediately');

  dump = await getBrainDump(OWNER);
  assert(!dump.some((t) => t.id === task.id), 'a scheduled task no longer appears in the brain dump');

  projTasks = await getTasksForProject('p1');
  const seen = projTasks.find((t) => t.id === task.id)!;
  assert(seen.scheduled_date === '2026-09-20' && seen.scheduled_hour === 10 && seen.duration_hours === 2,
    'the project to-do list reflects the schedule/duration change made from Today — same record, no sync step needed');

  // Completing from the project side must be visible from Today.
  await table<Task>('tasks').update(task.id, { done: true });
  const forDate2 = await getTasksForDate(OWNER, '2026-09-20');
  assert(forDate2.find((t) => t.id === task.id)?.done === true, 'marking done from the project view is reflected on Today');

  // Sorting: unscheduled after scheduled, scheduled tasks time-ordered.
  await table<Task>('tasks').insert({
    id: 't2', owner_id: OWNER, project_id: 'p1', title: 'Unscheduled follow-up',
    scheduled_date: null, scheduled_hour: null, duration_hours: 1, done: false,
    created_at: new Date().toISOString(),
  });
  await table<Task>('tasks').insert({
    id: 't3', owner_id: OWNER, project_id: 'p1', title: 'Earlier same day',
    scheduled_date: '2026-09-20', scheduled_hour: 8, duration_hours: 1, done: false,
    created_at: new Date().toISOString(),
  });
  const ordered = (await getTasksForProject('p1')).map((t) => t.id);
  assert(ordered[0] === 't3' && ordered[1] === 't1', `scheduled tasks sort by time first (got ${ordered.join(',')})`);
  assert(ordered[ordered.length - 1] === 't2', 'unscheduled tasks sort to the end');

  writeDb(empty);
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
