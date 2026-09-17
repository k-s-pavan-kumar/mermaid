import type { Task } from './types';

/**
 * One place that decides where a block sits and how tall it is.
 *
 * The grid used to be whole hours: `scheduled_hour` (0-23) plus
 * `duration_hours` (1-8). Half-hour precision is added *alongside* those
 * columns rather than replacing them, because rows written under the old
 * model are still in the database and must keep rendering exactly where
 * they did before:
 *
 *   scheduled_minute  — 0 or 30; absent/null means :00, i.e. the old behaviour
 *   duration_minutes  — total length; absent/null falls back to
 *                       duration_hours * 60, i.e. the old behaviour
 *
 * Every read goes through startMinutes()/durationMinutes() so no call site
 * has to remember which of the two shapes a given row is in.
 */

export const SLOT_MINUTES = 30;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
export const SLOTS_PER_DAY = 24 * SLOTS_PER_HOUR;

/** Shortest block the UI will create or resize to. */
export const MIN_DURATION_MINUTES = SLOT_MINUTES;
/** Longest block. 8h was the old ceiling; kept, now expressed in minutes. */
export const MAX_DURATION_MINUTES = 8 * 60;

/** Round any minute value onto the half-hour grid. */
export function snapToSlot(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Normalise a minute-of-hour to the 0 | 30 the schema allows. */
export function normaliseMinute(minute: number | null | undefined): 0 | 30 {
  return Math.round((minute ?? 0) / SLOT_MINUTES) % SLOTS_PER_HOUR === 1 ? 30 : 0;
}

/** Minutes from midnight where this task's block starts. */
export function startMinutes(t: Pick<Task, 'scheduled_hour' | 'scheduled_minute'>): number {
  if (t.scheduled_hour === null || t.scheduled_hour === undefined) return 0;
  return t.scheduled_hour * 60 + normaliseMinute(t.scheduled_minute);
}

/** How long this task's block runs, in minutes, clamped to the legal range. */
export function durationMinutes(t: Pick<Task, 'duration_minutes' | 'duration_hours'>): number {
  const raw =
    t.duration_minutes !== null && t.duration_minutes !== undefined
      ? t.duration_minutes
      : (t.duration_hours ?? 1) * 60;
  return clampDuration(raw);
}

export function clampDuration(minutes: number): number {
  const snapped = snapToSlot(minutes);
  return Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, snapped));
}

/** Slot index (0-47) a block starts in. */
export function startSlot(t: Pick<Task, 'scheduled_hour' | 'scheduled_minute'>): number {
  return Math.floor(startMinutes(t) / SLOT_MINUTES);
}

/** Split a slot index back into the hour/minute pair the actions expect. */
export function slotToHourMinute(slot: number): { hour: number; minute: 0 | 30 } {
  const clamped = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.round(slot)));
  return {
    hour: Math.floor(clamped / SLOTS_PER_HOUR),
    minute: clamped % SLOTS_PER_HOUR === 1 ? 30 : 0,
  };
}

/** "9:30 AM" — the label on a block and in the hour gutter. */
export function fmtClock(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(m / 60);
  const minute = m % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/** "1h 30m" / "45m" / "2h" — what a block says about its own length. */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** The time range a block covers, for titles and the week view. */
export function fmtRange(t: Pick<Task, 'scheduled_hour' | 'scheduled_minute' | 'duration_minutes' | 'duration_hours'>): string {
  const start = startMinutes(t);
  return `${fmtClock(start)} – ${fmtClock(start + durationMinutes(t))}`;
}
