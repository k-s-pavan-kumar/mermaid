import { table } from '@/lib/data';
import type { Task, DayBlock } from './types';
import { addDays } from './dayblocks';

/** Rows written before dump_date existed won't have it — fall back to the
 * date portion of created_at rather than crashing or silently dropping them. */
function effectiveDumpDate(t: Task): string {
  return t.dump_date ?? t.created_at.slice(0, 10);
}

export async function getBrainDump(ownerId: string): Promise<Task[]> {
  const tasks = await table<Task>('tasks').where((t) => t.owner_id === ownerId && !t.scheduled_date && !t.done);
  return tasks.sort((a, b) => effectiveDumpDate(a).localeCompare(effectiveDumpDate(b)) || a.created_at.localeCompare(b.created_at));
}

export interface BrainDumpGroup { date: string; tasks: Task[] }

/** Same data as getBrainDump, grouped by the day each task was captured —
 * this is what fixes "not stored date wise": every item now carries and
 * displays which day it was dumped, oldest first, so a backlog doesn't
 * silently blur together. */
export async function getBrainDumpGrouped(ownerId: string): Promise<BrainDumpGroup[]> {
  const tasks = await getBrainDump(ownerId);
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    const d = effectiveDumpDate(t);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(t);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, tasks]) => ({ date, tasks }));
}

export async function getTasksForDate(ownerId: string, date: string): Promise<Task[]> {
  return table<Task>('tasks').where((t) => t.owner_id === ownerId && t.scheduled_date === date);
}

/**
 * Tasks scheduled on a day before `today` that never got marked done.
 * This is the fix for "pending tasks silently disappear" — a fresh day is
 * correctly empty by design (scheduled_date scopes it), but without this,
 * an unfinished task from three days ago is invisible unless you happen to
 * click Prev three times. Sorted oldest-first, since that's usually what
 * needs attention soonest.
 */
export async function getOverdueTasks(ownerId: string, today: string): Promise<Task[]> {
  const tasks = await table<Task>('tasks').where(
    (t) => t.owner_id === ownerId && !t.done && !!t.scheduled_date && t.scheduled_date! < today
  );
  return tasks.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''));
}

export interface DayLoad {
  /** Scheduled on that day and still open. */
  pending: number;
  done: number;
  total: number;
}

/**
 * Per-day counts for every day that has scheduled work, keyed 'YYYY-MM-DD'.
 *
 * This is what makes the calendar useful rather than decorative: a fresh day
 * is empty by design, so without a month view showing which days still carry
 * open tasks, a backlog is only findable by clicking Prev repeatedly. The
 * whole set is small (one row per task) and the map is built once per render,
 * so the month view can page around without re-querying.
 */
export async function getDayLoads(ownerId: string): Promise<Record<string, DayLoad>> {
  const tasks = await table<Task>('tasks').where((t) => t.owner_id === ownerId && !!t.scheduled_date);
  const map: Record<string, DayLoad> = {};

  for (const t of tasks) {
    const d = t.scheduled_date!;
    const entry = map[d] ?? (map[d] = { pending: 0, done: 0, total: 0 });
    entry.total += 1;
    if (t.done) entry.done += 1;
    else entry.pending += 1;
  }

  return map;
}

export async function getTasksForProject(projectId: string): Promise<Task[]> {
  const tasks = await table<Task>('tasks').where((t) => t.project_id === projectId);
  return tasks.sort((a, b) => {
    if (!!a.scheduled_date !== !!b.scheduled_date) return a.scheduled_date ? -1 : 1;
    if (a.scheduled_date && b.scheduled_date) {
      const d = a.scheduled_date.localeCompare(b.scheduled_date);
      if (d !== 0) return d;
      return (a.scheduled_hour ?? 0) - (b.scheduled_hour ?? 0);
    }
    return effectiveDumpDate(a).localeCompare(effectiveDumpDate(b));
  });
}

/**
 * Sleep / travel / office blocks that touch `date`: anything starting on it,
 * plus anything that started the day before (last night's sleep runs past
 * midnight into this morning).
 */
export async function getDayBlocks(ownerId: string, date: string): Promise<DayBlock[]> {
  const prev = addDays(date, -1);
  const rows = await table<DayBlock>('day_blocks').where(
    (b) => b.owner_id === ownerId && (b.date === date || b.date === prev)
  );
  return rows.sort((a, b) => (a.date === b.date ? a.start_minute - b.start_minute : a.date < b.date ? -1 : 1));
}
