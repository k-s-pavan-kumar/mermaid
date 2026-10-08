import type { Task } from './types';
import { durationMinutes, startMinutes } from './time';

export type UpNextKind = 'now' | 'one-thing' | 'next' | 'missed' | 'due' | 'dump';
export interface UpNextPick {
  task: Task;
  kind: UpNextKind;
  /** Minutes left in the block (kind 'now') or until it starts (kind 'next'). */
  minutes?: number;
}

/**
 * The single thing to look at right now — so the day never opens with
 * "what should I do?". Order: the block you're inside > your pinned One Thing >
 * the next block today > a block you missed earlier today > the most urgent
 * deadline > the oldest thing in the brain dump.
 */
export function pickUpNext(input: {
  todayTasks: Task[];      // everything scheduled today
  oneThingId?: string | null;
  dueSoon: Task[];
  dump: Task[];
  nowMinutes: number;
}): UpNextPick | null {
  const open = input.todayTasks.filter((t) => !t.done && t.scheduled_hour !== null && t.scheduled_hour !== undefined);
  const withTimes = open.map((t) => ({ t, s: startMinutes(t), e: startMinutes(t) + durationMinutes(t) }));
  const now = input.nowMinutes;

  const current = withTimes.filter((x) => x.s <= now && now < x.e).sort((a, b) => a.s - b.s)[0];
  if (current) return { task: current.t, kind: 'now', minutes: current.e - now };

  const pinned = input.oneThingId ? input.todayTasks.find((t) => t.id === input.oneThingId && !t.done) : undefined;
  if (pinned) return { task: pinned, kind: 'one-thing' };

  const next = withTimes.filter((x) => x.s > now).sort((a, b) => a.s - b.s)[0];
  if (next) return { task: next.t, kind: 'next', minutes: next.s - now };

  const missed = withTimes.filter((x) => x.e <= now).sort((a, b) => b.e - a.e)[0];
  if (missed) return { task: missed.t, kind: 'missed' };

  if (input.dueSoon[0]) return { task: input.dueSoon[0], kind: 'due' };
  if (input.dump[0]) return { task: input.dump[0], kind: 'dump' };
  return null;
}
