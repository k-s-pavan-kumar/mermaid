/**
 * Yearly goals.
 *
 * A goal belongs to one calendar year ("Launch 4 plugins", "Reach ₹X in
 * freelance income"). Projects are attached to a goal through GoalProject,
 * and each attachment carries the MONTH of that year the project is planned
 * for — that is the month-wise plan. One project can serve several goals,
 * and a goal usually has several projects.
 */
export type GoalStatus = 'active' | 'done' | 'dropped';

export interface Goal {
  id: string;
  owner_id: string;
  /** Calendar year, e.g. 2026. */
  year: number;
  title: string;
  description: string | null;
  status: GoalStatus;
  created_at: string;
}

export interface GoalProject {
  id: string;
  owner_id: string;
  goal_id: string;
  project_id: string;
  /** 'YYYY-MM', always inside the goal's year. null = attached but not yet placed in a month. */
  month: string | null;
  created_at: string;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** '01'..'12' (what the forms post) + a year -> 'YYYY-MM', or null if it isn't a real month. */
export function monthKey(year: number, mm: string): string | null {
  if (!/^(0[1-9]|1[0-2])$/.test(mm)) return null;
  return `${year}-${mm}`;
}

/** '2026-03' -> 'March 2026'. Anything else -> 'No month yet'. */
export function monthLabel(key: string | null): string {
  if (!key || !/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return 'No month yet';
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { active: 'Active', done: 'Achieved', dropped: 'Dropped' };
