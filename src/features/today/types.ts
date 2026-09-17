export interface Task {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  dump_date: string;              // 'YYYY-MM-DD' — the day it was captured, always set
  scheduled_date: string | null;  // 'YYYY-MM-DD' — null means it's still in the brain dump
  scheduled_hour: number | null;  // 0-23
  /**
   * Minute within `scheduled_hour` — 0 or 30. Absent/null means :00, which
   * is exactly how every row written before half-hour slots existed
   * behaves, so nothing needs backfilling.
   */
  scheduled_minute?: number | null;
  duration_hours: number;         // legacy whole-hour length; still written for compatibility
  /**
   * Block length in minutes, in 30-minute steps. Takes precedence over
   * `duration_hours` when set; when it isn't, readers fall back to
   * duration_hours * 60. Always go through
   * `durationMinutes()` in ./time.ts rather than reading either directly.
   */
  duration_minutes?: number | null;
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
