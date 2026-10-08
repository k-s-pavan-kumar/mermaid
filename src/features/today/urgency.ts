/**
 * Deadline urgency. Date-only deadlines: a task due "today" is due by the end
 * of today, so the countdown on the day itself runs to 23:59.
 */
export type UrgencyLevel = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later';
export interface Urgency { level: UrgencyLevel; label: string; days: number }

const utc = (iso: string) => { const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysUntil = (due: string, today: string) => Math.round((utc(due) - utc(today)) / 86_400_000);

/** `nowMinutes` (minutes since midnight) is only used to say "5h left" on the due day. */
export function urgencyOf(due: string, today: string, nowMinutes?: number): Urgency {
  const days = daysUntil(due, today);
  if (days < 0) return { level: 'overdue', days, label: `${-days}d overdue` };
  if (days === 0) {
    if (nowMinutes === undefined) return { level: 'today', days, label: 'due today' };
    const left = 24 * 60 - nowMinutes;
    const h = Math.floor(left / 60), m = left % 60;
    return { level: 'today', days, label: `due today · ${h > 0 ? `${h}h ${m}m` : `${m}m`} left` };
  }
  if (days === 1) return { level: 'tomorrow', days, label: 'due tomorrow' };
  if (days <= 3) return { level: 'soon', days, label: `due in ${days}d` };
  return { level: 'later', days, label: `due in ${days}d` };
}

export const URGENCY_COLOR: Record<UrgencyLevel, string> = {
  overdue: '#c0392b', today: '#c0392b', tomorrow: '#d9822b', soon: '#b8860b', later: 'var(--muted, #888)',
};
