import { table } from '@/lib/data';
import { todayIso, shiftIso } from '@/lib/tz/today';
import type { FocusSession, Task } from './types';
import type { Project } from '@/features/projects/types';
import type { Meeting } from '@/features/meetings/types';

/**
 * Momentum, not productivity scores.
 *
 * The numbers here are deliberately forgiving: a day counts as "moved" if
 * ANY task was completed or ANY focus block was run. Streaks that break on
 * a single quiet day punish exactly the person this app is for, so a day
 * with a meeting or a focus session still counts as a day the work was
 * touched.
 */

export interface DayStats {
  date: string;
  planned: number;
  done: number;
  focusMinutes: number;
  sessions: number;
  meetings: number;
  /** Did the day move at all? */
  moved: boolean;
}

export async function getDayStats(ownerId: string, from: string, to: string): Promise<Record<string, DayStats>> {
  const [tasks, sessions, meetings] = await Promise.all([
    table<Task>('tasks').where((t) => t.owner_id === ownerId),
    table<FocusSession>('focus_sessions').where((f) => f.owner_id === ownerId),
    table<Meeting>('meetings').where((m) => m.owner_id === ownerId),
  ]);

  const stats: Record<string, DayStats> = {};
  const touch = (date: string): DayStats =>
    (stats[date] ??= { date, planned: 0, done: 0, focusMinutes: 0, sessions: 0, meetings: 0, moved: false });

  const inRange = (d?: string | null) => !!d && d >= from && d <= to;

  for (const t of tasks) {
    if (inRange(t.scheduled_date)) {
      const s = touch(t.scheduled_date!);
      s.planned += 1;
      if (t.done) s.done += 1;
    }
  }
  for (const f of sessions) {
    if (inRange(f.date)) {
      const s = touch(f.date);
      s.focusMinutes += f.completed_minutes;
      s.sessions += 1;
    }
  }
  for (const m of meetings) {
    const d = m.starts_at.slice(0, 10);
    if (inRange(d)) touch(d).meetings += 1;
  }

  for (const s of Object.values(stats)) {
    s.moved = s.done > 0 || s.focusMinutes > 0 || s.meetings > 0;
  }
  return stats;
}

/** Consecutive days up to today where something moved. Today not yet moved
 *  does not break the streak — the day isn't over. */
export async function getStreak(ownerId: string): Promise<{ days: number; todayMoved: boolean }> {
  const today = todayIso();
  const from = shiftIso(today, -120);
  const stats = await getDayStats(ownerId, from, today);

  const todayMoved = !!stats[today]?.moved;
  let days = 0;
  let cursor = todayMoved ? today : shiftIso(today, -1);

  while (stats[cursor]?.moved) {
    days += 1;
    cursor = shiftIso(cursor, -1);
  }
  return { days, todayMoved };
}

/**
 * Projects with no activity for a while.
 *
 * Surfaced rather than scored: the useful response to a stalled project is
 * often to shelve it deliberately, and you can't decide that about something
 * you've stopped seeing.
 */
export async function getStalledProjects(
  ownerId: string,
  quietDays = 14
): Promise<{ id: string; name: string; status: string; lastTouched: string | null; days: number }[]> {
  const today = todayIso();
  const [projects, tasks, sessions] = await Promise.all([
    table<Project>('projects').where((p) => p.owner_id === ownerId),
    table<Task>('tasks').where((t) => t.owner_id === ownerId),
    table<FocusSession>('focus_sessions').where((f) => f.owner_id === ownerId),
  ]);

  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

  return projects
    .filter((p) => p.status !== 'done' && p.status !== 'dropped')
    .map((p) => {
      const dates = [
        ...tasks.filter((t) => t.project_id === p.id && t.done).map((t) => t.scheduled_date ?? t.dump_date),
        ...sessions.filter((f) => f.project_id === p.id).map((f) => f.date),
      ].filter((d): d is string => !!d);

      const lastTouched = dates.sort().pop() ?? null;
      return { id: p.id, name: p.name, status: p.status, lastTouched, days: lastTouched ? daysBetween(lastTouched, today) : 999 };
    })
    .filter((p) => p.days >= quietDays)
    .sort((a, b) => b.days - a.days);
}
