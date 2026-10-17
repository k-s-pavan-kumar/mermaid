import type { Task } from './types';

/** 'this' = one day · 'later' = this day onward (done days kept) · 'all' = the whole series. */
export type SeriesDeleteScope = 'this' | 'later' | 'all';

/**
 * Which tasks a "delete" on `anchor` removes. Pure, so the rule is testable
 * and the server action is just "pick, then remove".
 *
 * A one-off task (no series_id) is only ever itself. The task you clicked is
 * always included, even if it is already ticked done.
 */
export function pickSeriesToDelete(all: Task[], anchor: Task, scope: SeriesDeleteScope): Task[] {
  if (scope === 'this' || !anchor.series_id) return [anchor];
  const sameSeries = all.filter((t) => t.owner_id === anchor.owner_id && t.series_id === anchor.series_id);
  if (scope === 'all') return sameSeries;
  const from = anchor.scheduled_date ?? '';
  const picked = sameSeries.filter((t) => !t.done && (t.scheduled_date ?? '') >= from);
  return picked.some((t) => t.id === anchor.id) ? picked : [...picked, anchor];
}
