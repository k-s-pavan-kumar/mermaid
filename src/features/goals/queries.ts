import { table } from '@/lib/data';
import type { Goal, GoalProject } from './types';

const byCreated = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

export async function getGoals(ownerId: string, year?: number): Promise<Goal[]> {
  const rows = await table<Goal>('goals').where((g) => g.owner_id === ownerId && (year === undefined || g.year === year));
  return rows.sort(byCreated);
}

/** Years that have at least one goal — drives the year switcher. */
export async function getGoalYears(ownerId: string): Promise<number[]> {
  const rows = await table<Goal>('goals').where((g) => g.owner_id === ownerId);
  return [...new Set(rows.map((g) => g.year))].sort((a, b) => a - b);
}

export async function getGoalLinks(ownerId: string, goalIds?: string[]): Promise<GoalProject[]> {
  const ids = goalIds ? new Set(goalIds) : null;
  const rows = await table<GoalProject>('goal_projects').where((l) => l.owner_id === ownerId && (!ids || ids.has(l.goal_id)));
  return rows.sort((a, b) => (a.month ?? '9999-99').localeCompare(b.month ?? '9999-99') || byCreated(a, b));
}

export async function getLinksForProject(ownerId: string, projectId: string): Promise<GoalProject[]> {
  const rows = await table<GoalProject>('goal_projects').where((l) => l.owner_id === ownerId && l.project_id === projectId);
  return rows.sort(byCreated);
}
