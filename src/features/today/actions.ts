'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { todayIso } from '@/lib/tz/today';
import type { FocusSession, Task } from './types';
import { clampDuration, normaliseMinute, MIN_DURATION_MINUTES } from './time';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

// Revalidate both surfaces that read tasks — Today and the owning project's
// detail page — so a change made in either place shows up in the other on
// next navigation, with no separate sync step.
function revalidateTaskSurfaces(projectId: string | null) {
  revalidatePath('/today');
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function addTask(formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const project_id = String(formData.get('project_id') ?? '').trim() || null;
  const now = new Date();

  await table<Task>('tasks').insert({
    id: newId(),
    owner_id,
    project_id,
    title,
    dump_date: todayIso(),
    scheduled_date: null,
    scheduled_hour: null,
    scheduled_minute: null,
    duration_hours: 1,
    duration_minutes: MIN_DURATION_MINUTES * 2, // 1h default, expressed on the new grid
    done: false,
    created_at: now.toISOString(),
  });

  revalidateTaskSurfaces(project_id);
}

/** Same as addTask, but bound to a project from that project's own to-do
 * list — project_id is fixed by the caller, not a form field. */
export async function addProjectTask(projectId: string, formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const now = new Date();

  await table<Task>('tasks').insert({
    id: newId(),
    owner_id,
    project_id: projectId,
    title,
    dump_date: todayIso(),
    scheduled_date: null,
    scheduled_hour: null,
    scheduled_minute: null,
    duration_hours: 1,
    duration_minutes: MIN_DURATION_MINUTES * 2, // 1h default, expressed on the new grid
    done: false,
    created_at: now.toISOString(),
  });

  revalidateTaskSurfaces(projectId);
}

/**
 * Place a task on the grid. `minute` is 0 or 30 — the grid is half-hourly
 * now, so a 9:30 start is a first-class position rather than something
 * rounded away to 9:00.
 *
 * duration_hours is still written alongside duration_minutes so that any
 * reader that hasn't been migrated (and the old CHECK constraint) still
 * sees a sane whole-hour value.
 */
export async function scheduleTask(id: string, date: string, hour: number, minute = 0): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, {
    scheduled_date: date,
    scheduled_hour: Math.max(0, Math.min(23, Math.round(hour))),
    scheduled_minute: normaliseMinute(minute),
  });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

/** One-click fix for an overdue task: re-date it to today, keep its hour
 * and duration as-is. Used by the Overdue banner. */
export async function moveTaskToToday(id: string, todayDate: string): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, { scheduled_date: todayDate });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

/**
 * Roll every unfinished task from an earlier day onto today in one go.
 * Clearing a backlog one button at a time is the kind of chore that makes
 * people stop trusting the overdue list and start ignoring it.
 */
export async function moveAllOverdueToToday(todayDate: string): Promise<void> {
  const owner_id = await requireOwner();
  const overdue = await table<Task>('tasks').where(
    (t) => t.owner_id === owner_id && !t.done && !!t.scheduled_date && t.scheduled_date! < todayDate
  );

  const projectIds = new Set<string | null>();
  for (const t of overdue) {
    await table<Task>('tasks').update(t.id, { scheduled_date: todayDate });
    projectIds.add(t.project_id);
  }

  revalidatePath('/today');
  for (const pid of projectIds) {
    if (pid) revalidatePath(`/projects/${pid}`);
  }
}

/**
 * Drag-resize on the timebox calls this with the new span in MINUTES.
 *
 * Snapped to 30-minute steps and clamped to 30 minutes .. 8 hours. Both
 * columns are written: duration_minutes is the real value, duration_hours
 * is kept in sync (rounded up, never below 1) purely so older readers and
 * the original whole-hour CHECK constraint stay happy.
 */
export async function resizeTask(id: string, newDurationMinutes: number): Promise<void> {
  await requireOwner();
  const minutes = clampDuration(newDurationMinutes);
  const updated = await table<Task>('tasks').update(id, {
    duration_minutes: minutes,
    duration_hours: Math.max(1, Math.min(8, Math.ceil(minutes / 60))),
  });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

/** Move an already-placed block to a new start time without changing its
 *  length — dragging the body of a block rather than its bottom edge. */
export async function moveTask(id: string, date: string, hour: number, minute = 0): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, {
    scheduled_date: date,
    scheduled_hour: Math.max(0, Math.min(23, Math.round(hour))),
    scheduled_minute: normaliseMinute(minute),
  });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

export async function unscheduleTask(id: string): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, {
    scheduled_date: null, scheduled_hour: null, scheduled_minute: null,
  });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

export async function toggleTaskDone(id: string, done: boolean): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, { done });
  revalidateTaskSurfaces(updated?.project_id ?? null);
}

/** Tag or untag a task with a custom Dashboard category — overrides its
 *  project's type in the 24-hour split. An empty string clears the tag,
 *  falling back to the project's type exactly as before this existed. */
export async function setTaskCategory(id: string, category: string): Promise<void> {
  await requireOwner();
  const updated = await table<Task>('tasks').update(id, { category: category || null });
  revalidateTaskSurfaces(updated?.project_id ?? null);
  revalidatePath('/dashboard');
}

export async function deleteTask(id: string): Promise<void> {
  await requireOwner();
  const existing = await table<Task>('tasks').find(id);
  await table<Task>('tasks').remove(id);
  revalidateTaskSurfaces(existing?.project_id ?? null);
}

/**
 * Pick the day's ONE thing.
 *
 * Not a priority field and not a label — exactly one task per day, shown
 * above everything else. A list of twelve "important" tasks is the same as
 * no list at all when deciding what to open is itself the hard part.
 */
export async function setOneThing(taskId: string, date: string): Promise<void> {
  const owner_id = await requireOwner();

  const current = await table<Task>('tasks').where((t) => t.owner_id === owner_id && t.focus_date === date);
  for (const t of current) {
    if (t.id !== taskId) await table<Task>('tasks').update(t.id, { focus_date: null });
  }

  const task = await table<Task>('tasks').find(taskId);
  // Clicking the same task again clears it — the choice should be as easy
  // to undo as to make.
  await table<Task>('tasks').update(taskId, { focus_date: task?.focus_date === date ? null : date });

  revalidateTaskSurfaces(task?.project_id ?? null);
}

/** Record a focus block. Called when the timer finishes or is stopped early. */
export async function logFocusSession(input: {
  minutes: number;
  completedMinutes: number;
  taskId?: string | null;
  projectId?: string | null;
  note?: string | null;
}): Promise<void> {
  const owner_id = await requireOwner();
  if (input.completedMinutes < 1) return;

  await table<FocusSession>('focus_sessions').insert({
    id: newId(),
    owner_id,
    task_id: input.taskId ?? null,
    project_id: input.projectId ?? null,
    date: todayIso(),
    started_at: new Date(Date.now() - input.completedMinutes * 60_000).toISOString(),
    minutes: input.minutes,
    completed_minutes: Math.round(input.completedMinutes),
    note: input.note ?? null,
  });

  revalidatePath('/today');
  revalidatePath('/calendar');
}
