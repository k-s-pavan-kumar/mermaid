/**
 * Course/cert tracker. Its one notable behavior: a course can be linked to
 * a Reward Vault Need, the same way a project can — see
 * `@/features/reward-vault/source.ts`, which reads `courseStatus()` and
 * `courseProgressPct()` from here rather than this feature knowing anything
 * about the Reward Vault.
 */
export interface Course {
  id: string;
  owner_id: string;
  title: string;
  provider: string;
  /** Free-growing list, not a fixed enum — "Kong" and "DigitalOcean" are as
   *  valid a tag as "TypeScript". */
  topic_tags: string[];
  total_lessons: number;
  completed_lessons: number;
  /** Set once, the instant completed_lessons first reaches total_lessons —
   *  never reset if lesson counts are later edited back down. */
  completed_at: string | null;
  created_at: string;
}

export type CourseStatus = 'not_started' | 'in_progress' | 'completed';

/** Always derive status from lesson counts — never let the UI set it
 *  directly, or a lesson-count edit and the status can drift out of sync. */
export function courseStatus(c: Pick<Course, 'completed_lessons' | 'total_lessons'>): CourseStatus {
  if (c.total_lessons <= 0) return 'not_started';
  if (c.completed_lessons >= c.total_lessons) return 'completed';
  if (c.completed_lessons > 0) return 'in_progress';
  return 'not_started';
}

export function courseProgressPct(c: Pick<Course, 'completed_lessons' | 'total_lessons'>): number {
  if (c.total_lessons <= 0) return 0;
  return Math.min(100, Math.round((c.completed_lessons / c.total_lessons) * 100));
}

export const TOPIC_TAG_CHOICES = [
  'TypeScript', 'Next.js', 'Figma', 'FastAPI', 'PostgreSQL', 'Redis', 'Kong', 'DigitalOcean', 'VSCode', 'Other',
];
