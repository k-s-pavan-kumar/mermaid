'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { createProjectRecord } from '@/features/projects/service';
import { newId } from '@/lib/id';
import type { Project } from '@/features/projects/types';
import type { Goal, GoalProject, GoalStatus } from './types';
import { monthKey } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/** Where the form was submitted from, so we go back to the same page. Only our own pages are allowed. */
function returnPath(fd: FormData): string {
  const r = String(fd.get('return_to') ?? '');
  return r === '/goals' || r === '/tpn-audits' || /^\/(fields|products)\/[0-9a-f-]{36}$/.test(r) ? r : '/goals';
}

function refresh(projectId?: string | null) {
  revalidatePath('/goals');
  revalidatePath('/tpn-audits');
  revalidatePath('/fields/[id]', 'page');
  revalidatePath('/products/[id]', 'page');
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

async function makeProject(
  owner: string, name: string, type: string, description: string | null, fieldId: string | null = null, productId: string | null = null,
): Promise<{ project: Project; usedFallback: boolean }> {
  return createProjectRecord(owner, { name, type, description, fieldId, productId });
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

  const fieldRaw = String(formData.get('field_id') ?? '').trim();
  let field_id: string | null = null;
  if (fieldRaw) {
    const tag = await table<{ id: string; owner_id: string }>('tags').find(fieldRaw);
    if (tag && tag.owner_id === owner) field_id = tag.id;
  }
  const productRaw = String(formData.get('product_id') ?? '').trim();
  let product_id: string | null = null;
  if (productRaw) {
    const prod = await table<{ id: string; owner_id: string }>('products').find(productRaw);
    if (prod && prod.owner_id === owner) product_id = prod.id;
  }
  const targetRaw = String(formData.get('target_value') ?? '').trim();
  const target = targetRaw ? Number(targetRaw) : NaN;
  const back = returnPath(formData);

  const goal = await table<Goal>('goals').insert({
    id: newId(), owner_id: owner, year, title,
    description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
    status: 'active', created_at: new Date().toISOString(),
    ...(field_id ? { field_id } : {}),
    ...(product_id ? { product_id } : {}),
    ...(Number.isFinite(target) && target > 0 ? { target_value: target, unit: String(formData.get('unit') ?? '').trim().slice(0, 16) || null, progress_value: 0 } : {}),
  });

  let notice = '';
  if (formData.get('create_project') === 'on') {
    try {
      const { project, usedFallback } = await makeProject(owner, title, String(formData.get('type') ?? 'internal'), goal.description, field_id, product_id);
      await attach(owner, goal, project.id, String(formData.get('month') ?? ''));
      if (usedFallback) notice = 'type';
    } catch {
      notice = 'project-failed'; // the goal itself is saved; only the auto-created project is missing
    }
  }
  refresh();
  redirect(`${back}?year=${year}${notice ? `&notice=${notice}` : ''}`);
}

/** Update hand-kept progress toward the goal's numeric target (form: progress_value). */
export async function setGoalProgress(goalId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  if (!(await ownGoal(owner, goalId))) return;
  const n = Number(String(formData.get('progress_value') ?? '').trim());
  if (!Number.isFinite(n) || n < 0) return;
  await table<Goal>('goals').update(goalId, { progress_value: n });
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
  let notice = '';
  let projectId: string | null = null;
  try {
    const made = await makeProject(owner, name, String(formData.get('type') ?? 'internal'), null, goal.field_id ?? null, goal.product_id ?? null);
    projectId = made.project.id;
    await attach(owner, goal, made.project.id, String(formData.get('month') ?? ''));
    if (made.usedFallback) notice = 'type';
  } catch {
    notice = 'project-failed';
  }
  refresh(projectId);
  redirect(`${returnPath(formData)}?year=${goal.year}${notice ? `&notice=${notice}` : ''}`);
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
