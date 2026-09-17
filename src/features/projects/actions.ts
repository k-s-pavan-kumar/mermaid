'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { TYPE_COLOR } from '@/lib/project-colors';
import { scaffoldProject } from '@/features/scaffold/actions';
import type {
  Project,
  ProjectPhase,
  BountySubmission,
  Milestone,
  ProjectMetric,
  ProjectType,
  ProjectStatus,
} from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reads the multi-select type checkboxes off a form and normalises them:
 * unknown values dropped, duplicates removed, order preserved (first one
 * wins as the primary type). Falls back to the single `type` field, then to
 * 'internal', so a form posted without JS still produces a valid project.
 */
function readTypes(formData: FormData): [ProjectType, ...ProjectType[]] {
  const raw = formData
    .getAll('types')
    .map((v) => String(v))
    .filter((v): v is ProjectType => v in TYPE_COLOR);
  const [first, ...rest] = Array.from(new Set(raw));
  if (first) return [first, ...rest];

  const single = String(formData.get('type') ?? '');
  return single in TYPE_COLOR ? [single as ProjectType] : ['internal'];
}

export async function createProject(formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const types = readTypes(formData);

  const project = await table<Project>('projects').insert({
    id: newId('proj'),
    owner_id,
    name,
    type: types[0],
    types,
    client_id: String(formData.get('client_id') ?? '').trim() || null,
    status: String(formData.get('status') ?? 'idea') as ProjectStatus,
    description: String(formData.get('description') ?? '').trim() || null,
    created_at: new Date().toISOString(),
  });

  // Optional: create the folder on disk in the same step. "I decided to
  // build this" and "the repo exists" being two separate acts is exactly
  // where a project stalls before it starts, so the form can do both. A
  // failure here never blocks the project record — the Settings tab has the
  // same button, with the error message.
  let scaffoldNote = '';
  if (String(formData.get('scaffold') ?? '') === 'on') {
    const scaffoldForm = new FormData();
    scaffoldForm.set('folder', String(formData.get('folder') ?? ''));
    scaffoldForm.set('stack', String(formData.get('stack') ?? 'nextjs'));
    scaffoldForm.set('dev_browser', String(formData.get('dev_browser') ?? 'on'));
    const result = await scaffoldProject(project.id, scaffoldForm);
    scaffoldNote = result.ok ? 'created' : 'failed';
  }

  revalidatePath('/projects');
  redirect(`/projects/${project.id}${scaffoldNote ? `?tab=settings&scaffold=${scaffoldNote}` : ''}`);
}

export async function updateProjectStatus(id: string, formData: FormData): Promise<void> {
  await requireOwner();
  const status = String(formData.get('status') ?? '') as ProjectStatus;
  await table<Project>('projects').update(id, { status });
  revalidatePath(`/projects/${id}`);
  revalidatePath('/projects');
}

/** Edit the project header itself — name, types, client link, description. */
export async function updateProject(id: string, formData: FormData): Promise<void> {
  await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const types = readTypes(formData);

  await table<Project>('projects').update(id, {
    name,
    type: types[0],
    types,
    client_id: String(formData.get('client_id') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim() || null,
  });

  revalidatePath(`/projects/${id}`);
  revalidatePath('/projects');
}

/**
 * Deletes the project and everything hanging off it. Tasks are detached
 * rather than destroyed — a task you already did shouldn't vanish from
 * Today's history just because the project was archived; it just loses its
 * project tag.
 */
export async function deleteProject(id: string): Promise<void> {
  await requireOwner();
  // Cascade manually — the local store doesn't enforce foreign keys the
  // way Postgres will once this is on Supabase.
  for (const t of ['project_phases', 'quotes', 'invoices', 'bounty_submissions', 'project_metrics', 'milestones'] as const) {
    const rows = await table<{ id: string; project_id: string }>(t).where((r) => r.project_id === id);
    for (const row of rows) {
      await table<{ id: string }>(t).remove(row.id);
    }
  }
  const tasks = await table<{ id: string; project_id: string | null }>('tasks').where((t) => t.project_id === id);
  for (const t of tasks) {
    await table<{ id: string; project_id: string | null }>('tasks').update(t.id, { project_id: null });
  }

  await table<Project>('projects').remove(id);
  revalidatePath('/projects');
  revalidatePath('/today');
}

/** Same delete, but used from the project's own page — where staying put
 *  would mean sitting on a 404. */
export async function deleteProjectAndReturn(id: string): Promise<void> {
  await deleteProject(id);
  redirect('/projects');
}

export async function addPhase(projectId: string, formData: FormData): Promise<void> {
  await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;

  const existing = await table<ProjectPhase>('project_phases').where((p) => p.project_id === projectId);
  await table<ProjectPhase>('project_phases').insert({
    id: newId('phase'),
    project_id: projectId,
    label,
    color: normaliseColor(formData.get('color')),
    sort_order: existing.length,
    width_pct: clampWidth(formData.get('width_pct')),
  });

  revalidatePath(`/projects/${projectId}`);
}

/** Hex only — the colour input always sends one, but a hand-posted form
 *  shouldn't be able to push arbitrary CSS into an inline style. */
function normaliseColor(value: FormDataEntryValue | null): string {
  const hex = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1F5C4E';
}

function clampWidth(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * Edit a phase after the fact — label, colour and width are all editable,
 * which is the whole point: you rarely pick the right colour on the first
 * try, and re-creating the phase to change it loses its position.
 */
export async function updatePhase(projectId: string, phaseId: string, formData: FormData): Promise<void> {
  await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;

  await table<ProjectPhase>('project_phases').update(phaseId, {
    label,
    color: normaliseColor(formData.get('color')),
    width_pct: clampWidth(formData.get('width_pct')),
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deletePhase(projectId: string, phaseId: string): Promise<void> {
  await requireOwner();
  await table<ProjectPhase>('project_phases').remove(phaseId);

  // Close the gap in sort_order so a later insert doesn't collide.
  const remaining = (await table<ProjectPhase>('project_phases').where((p) => p.project_id === projectId)).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  for (let i = 0; i < remaining.length; i++) {
    const phase = remaining[i];
    if (phase && phase.sort_order !== i) {
      await table<ProjectPhase>('project_phases').update(phase.id, { sort_order: i });
    }
  }

  revalidatePath(`/projects/${projectId}`);
}

/** Nudge a phase left or right in the timeline. */
export async function movePhase(projectId: string, phaseId: string, direction: -1 | 1): Promise<void> {
  await requireOwner();
  const phases = (await table<ProjectPhase>('project_phases').where((p) => p.project_id === projectId)).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const idx = phases.findIndex((p) => p.id === phaseId);
  const target = idx + direction;
  const current = phases[idx];
  const swap = phases[target];
  if (idx === -1 || !current || !swap) return;

  await table<ProjectPhase>('project_phases').update(current.id, { sort_order: target });
  await table<ProjectPhase>('project_phases').update(swap.id, { sort_order: idx });

  revalidatePath(`/projects/${projectId}`);
}

export async function addSubmission(projectId: string, formData: FormData): Promise<void> {
  await requireOwner();
  const program = String(formData.get('program') ?? '').trim();
  if (!program) return;

  const payoutRaw = String(formData.get('payout') ?? '').trim();

  await table<BountySubmission>('bounty_submissions').insert({
    id: newId('sub'),
    project_id: projectId,
    program,
    severity: (String(formData.get('severity') ?? '') as BountySubmission['severity']) || null,
    status: String(formData.get('status') ?? 'submitted') as BountySubmission['status'],
    payout: payoutRaw ? Number(payoutRaw) : null,
    currency: 'INR',
    disclosure_deadline: String(formData.get('disclosure_deadline') ?? '').trim() || null,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function addMilestone(projectId: string, formData: FormData): Promise<void> {
  await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;

  await table<Milestone>('milestones').insert({
    id: newId('ms'),
    project_id: projectId,
    label,
    occurred_on: String(formData.get('occurred_on') ?? '').trim() || null,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function addMetric(projectId: string, formData: FormData): Promise<void> {
  await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  const value = String(formData.get('value') ?? '').trim();
  if (!label || !value) return;

  await table<ProjectMetric>('project_metrics').insert({
    id: newId('metric'),
    project_id: projectId,
    source: 'manual',
    label,
    value,
    delta: String(formData.get('delta') ?? '').trim() || null,
    captured_at: new Date().toISOString(),
  });

  revalidatePath(`/projects/${projectId}`);
}
