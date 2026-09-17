export interface Task {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  dump_date: string;              // 'YYYY-MM-DD' — the day it was captured, always set
  scheduled_date: string | null;  // 'YYYY-MM-DD' — null means it's still in the brain dump
  scheduled_hour: number | null;  // 0-23
  duration_hours: number;         // default 1; adjustable in the timebox UI
  done: boolean;
  /**
   * The date this task was picked as the day's ONE thing. At most one task
   * per date carries it. Modelled as a date rather than a boolean so
   * yesterday's choice doesn't silently become today's.
   */
  focus_date?: string | null;
  created_at: string;
}

/**
 * A completed (or abandoned) focus block. Recorded because "where did the
 * day go" is unanswerable from a task list alone — a day can be full of
 * real work and show nothing ticked off.
 */
export interface FocusSession {
  id: string;
  owner_id: string;
  task_id: string | null;
  project_id: string | null;
  date: string;          // 'YYYY-MM-DD' in the home timezone
  started_at: string;
  minutes: number;       // planned length
  completed_minutes: number;
  note: string | null;
}
