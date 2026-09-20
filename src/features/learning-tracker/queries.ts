import { table } from '@/lib/data';
import { courseStatus } from './types';
import type { Course } from './types';

export async function getCourses(ownerId: string): Promise<Course[]> {
  const rows = await table<Course>('courses').where((c) => c.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export interface LearningStats {
  inProgress: number;
  completedThisYear: number;
}

export async function getLearningStats(ownerId: string): Promise<LearningStats> {
  const courses = await getCourses(ownerId);
  const year = new Date().getFullYear().toString();
  return {
    inProgress: courses.filter((c) => courseStatus(c) === 'in_progress').length,
    completedThisYear: courses.filter((c) => (c.completed_at ?? '').startsWith(year)).length,
  };
}

/** Every topic tag actually in use, for the filter pills — grows with the
 *  user's own courses rather than being a fixed list. */
export function allTopicTags(courses: Course[]): string[] {
  const set = new Set<string>();
  for (const c of courses) for (const t of c.topic_tags) set.add(t);
  return [...set].sort();
}
