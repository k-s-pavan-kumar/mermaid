import { table } from '@/lib/data';
import type { Task } from './types';

/**
 * Pull every unfinished, earlier-dated task onto today — automatically, so a
 * pile of "overdue" never builds up to be avoided. Skips tasks created by a
 * Repeat (series_id): a missed 9–10 class yesterday shouldn't double up on
 * today's class. Idempotent; safe to call on every Today load.
 * Opt out with AUTO_ROLLOVER=off.
 */
export async function rolloverUnfinished(ownerId: string, today: string): Promise<number> {
  if (process.env.AUTO_ROLLOVER === 'off') return 0;
  const stale = await table<Task>('tasks').where(
    (t) => t.owner_id === ownerId && !t.done && !t.series_id && !!t.scheduled_date && t.scheduled_date! < today,
  );
  for (const t of stale) await table<Task>('tasks').update(t.id, { scheduled_date: today });
  return stale.length;
}
