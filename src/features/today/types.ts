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
  /**
   * Free-form category key for the Dashboard's 24-hour split — "deep-work",
   * "admin", "learning", whatever the person defined in Settings. Optional
   * and takes priority over the project's type when set: a task tagged
   * "admin" on a client project shows as admin time, not client time.
   * Absent/null falls back to the project's type, exactly as before this
   * existed.
   */
  category?: string | null;
  /**
   * Minutes actually worked on this task (not the planned block length).
   * Set by hand on the project's to-do tab and topped up automatically by
   * every timer session finished on the task. Absent means 0.
   */
  logged_minutes?: number;
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
  /**
   * Direct category tag for a session not tied to a task (or where the
   * session should be categorised differently from its task). When absent,
   * the Dashboard falls back to the linked task's category, then to the
   * project's type.
   */
  category?: string | null;
}
