import type { Task } from './types';
import { durationMinutes } from './time';

export interface MonthGroup {
  key: string;            // 'YYYY-MM', or 'unscheduled'
  label: string;          // 'October 2026' / 'Unscheduled'
  tasks: Task[];
  done: number;
  workedMinutes: number;  // hours actually logged
  plannedMinutes: number; // scheduled block lengths
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Buckets tasks by the month they're scheduled in (oldest month first, tasks
 * keep the order they came in, which is already date/time order) with the
 * unscheduled ones in a final group of their own.
 */
export function groupTasksByMonth(tasks: Task[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const t of tasks) {
    const key = t.scheduled_date ? t.scheduled_date.slice(0, 7) : 'unscheduled';
    let g = map.get(key);
    if (!g) {
      const label = key === 'unscheduled' ? 'Unscheduled' : `${MONTHS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`;
      g = { key, label, tasks: [], done: 0, workedMinutes: 0, plannedMinutes: 0 };
      map.set(key, g);
    }
    g.tasks.push(t);
    if (t.done) g.done++;
    g.workedMinutes += Math.max(0, t.logged_minutes ?? 0);
    if (t.scheduled_date) g.plannedMinutes += durationMinutes(t);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === 'unscheduled') return 1;
    if (b.key === 'unscheduled') return -1;
    return a.key.localeCompare(b.key);
  });
}
