'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { TYPE_COLOR } from '@/lib/project-colors';
import { newId } from '@/lib/id';
import type { Project, ProjectType } from '@/features/projects/types';
import type { Goal, GoalProject, GoalStatus } from './types';
import { monthKey } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function refresh(projectId?: string | null) {
  revalidatePath('/goals');
  revalidatePath('/projects');
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function ownGoal(owner: string, id: string): Promise<Goal | undefined> {
  const g = await table<Goal>('goals').find(id);
  return g && g.owner_id === owner ? g : undefined;
}

/**
 * Attach a project to a goal in a month. Idempotent per (goal, project): a
 * second call just moves the existing link to the new month, so the same
 * project is never listed twice under one goal.
 */
async function attach(owner: string, goal: Goal, projectId: string, mm: string): Promise<void> {
  const month = monthKey(goal.year, mm);
  const existing = await table<GoalProject>('goal_projects').where(
    (l) => l.owner_id === owner && l.goal_id === goal.id && l.project_id === projectId
  );
  if (existing[0]) {
    await table<GoalProject>('goal_projects').update(existing[0].id, { month });
    return;
  }
  await table<GoalProject>('goal_projects').insert({
    id: newId(), owner_id: owner, goal_id: goal.id, project_id: projectId, month,
    created_at: new Date().toISOString(),
  });
}

async function makeProject(owner: string, name: string, type: string, description: string | null): Promise<Project> {
  const t = (type in TYPE_COLOR ? type : 'internal') as ProjectType;
  return table<Project>('projects').insert({
    id: newId('proj'), owner_id: owner, name, type: t, types: [t], client_id: null,
    status: 'idea', description, created_at: new Date().toISOString(),
  });
}

/**
 * Add a yearly goal. If "also create a project" is ticked, a project named
 * after the goal is created and dropped into the chosen month straight away,
 * so a goal can go from idea to a plannable project in one step.
 */
export async function addGoal(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const title = String(formData.get('title') ?? '').trim().slice(0, 140);
  const year = Math.round(Number(formData.get('year')));
  if (!title || !Number.isInteger(year) || year < 2000 || year > 2100) return;

  const goal = await table<Goal>('goals').insert({
    id: newId(), owner_id: owner, year, title,
    description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
    status: 'active', created_at: new Date().toISOString(),
  });

  if (formData.get('create_project') === 'on') {
    const project = await makeProject(owner, title, String(formData.get('type') ?? 'internal'), goal.description);
    await attach(owner, goal, project.id, String(formData.get('month') ?? ''));
  }
  refresh();
}

export async function setGoalStatus(goalId: string, status: GoalStatus): Promise<void> {
  const owner = await requireOwner();
  if (!(['active', 'done', 'dropped'] as string[]).includes(status)) return;
  if (!(await ownGoal(owner, goalId))) return;
  await table<Goal>('goals').update(goalId, { status });
  refresh();
}

export async function deleteGoal(goalId: string): Promise<void> {
  const owner = await requireOwner();
  if (!(await ownGoal(owner, goalId))) return;
  // The projects themselves are never deleted — only their link to this goal.
  const links = await table<GoalProject>('goal_projects').where((l) => l.owner_id === owner && l.goal_id === goalId);
  for (const l of links) await table<GoalProject>('goal_projects').remove(l.id);
  await table<Goal>('goals').remove(goalId);
  refresh();
}

/** Put an existing project under a goal, in a month (form: project_id, month). */
export async function linkProjectToGoal(goalId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const goal = await ownGoal(owner, goalId);
  const projectId = String(formData.get('project_id') ?? '').trim();
  if (!goal || !projectId) return;
  const project = await table<Project>('projects').find(projectId);
  if (!project || project.owner_id !== owner) return;
  await attach(owner, goal, projectId, String(formData.get('month') ?? ''));
  refresh(projectId);
}

/** Create a brand-new project already planned under a goal (form: name, type, month). */
export async function createProjectForGoal(goalId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const goal = await ownGoal(owner, goalId);
  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  if (!goal || !name) return;
  const project = await makeProject(owner, name, String(formData.get('type') ?? 'internal'), null);
  await attach(owner, goal, project.id, String(formData.get('month') ?? ''));
  refresh(project.id);
}

/** Move a link to another month, or clear it with an empty month (form: month). */
export async function setLinkMonth(linkId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const link = await table<GoalProject>('goal_projects').find(linkId);
  if (!link || link.owner_id !== owner) return;
  const goal = await ownGoal(owner, link.goal_id);
  if (!goal) return;
  await table<GoalProject>('goal_projects').update(linkId, { month: monthKey(goal.year, String(formData.get('month') ?? '')) });
  refresh(link.project_id);
}

export async function unlinkGoalProject(linkId: string): Promise<void> {
  const owner = await requireOwner();
  const link = await table<GoalProject>('goal_projects').find(linkId);
  if (!link || link.owner_id !== owner) return;
  await table<GoalProject>('goal_projects').remove(linkId);
  refresh(link.project_id);
}

/** From a project's own Settings tab: attach it to a goal (form: goal_id, month). */
export async function assignProjectToGoal(projectId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const goal = await ownGoal(owner, String(formData.get('goal_id') ?? ''));
  const project = await table<Project>('projects').find(projectId);
  if (!goal || !project || project.owner_id !== owner) return;
  await attach(owner, goal, projectId, String(formData.get('month') ?? ''));
  refresh(projectId);
}
