'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import { TAG_COLORS, fieldProjectType, isHex, normaliseTagName, type Tag } from './types';
import { createProjectRecord } from '@/features/projects/service';
import { renameProblem, replaceTagInList } from './ops';
import { defaultIconFor, isIconKey } from './icons';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function refresh() {
  revalidatePath('/tags');
  revalidatePath('/clients', 'layout');
  revalidatePath('/goals');
  revalidatePath('/', 'layout'); // the sidebar lists fields on every page
}

/** The icon posted by the picker, or one guessed from the name. Spread into an insert; empty if the column isn't there yet. */
async function iconFor(formData: FormData, name: string): Promise<{ icon?: string }> {
  const picked = String(formData.get('icon') ?? '');
  return { icon: isIconKey(picked) ? picked : defaultIconFor({ name, special: null }) };
}

export type TagResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * Create a tag straight away (used by the "Add tag" box on the client form, so
 * a new tag is saved the moment you add it — not only if the client is saved).
 * Idempotent by name, case-insensitively.
 */
export async function createTagByName(rawName: string): Promise<TagResult> {
  const owner = await requireOwner();
  const name = normaliseTagName(rawName);
  if (!name) return { ok: false, message: 'Type a tag name.' };
  const all = await table<Tag>('tags').where((t) => t.owner_id === owner);
  const hit = all.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (hit) return { ok: true, name: hit.name };
  try {
    await table<Tag>('tags').insert({
      id: newId(), owner_id: owner, name, color: TAG_COLORS[all.length % TAG_COLORS.length]!,
      is_field: false, special: null, sort_order: 0, created_at: new Date().toISOString(),
    });
  } catch {
    return { ok: false, message: "Couldn't save the tag — run supabase/APPLY_PENDING.sql first." };
  }
  refresh();
  return { ok: true, name };
}

/** Tags page form: name, color, "gets its own page" checkbox. */
export async function addTag(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const name = normaliseTagName(String(formData.get('name') ?? ''));
  if (!name) return;
  const all = await table<Tag>('tags').where((t) => t.owner_id === owner);
  if (all.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
  const color = String(formData.get('color') ?? '');
  const isField = formData.get('is_field') === 'on';
  const row = {
    id: newId(), owner_id: owner, name, color: isHex(color) ? color : TAG_COLORS[all.length % TAG_COLORS.length]!,
    is_field: isField, special: null,
    sort_order: isField ? all.filter((t) => t.is_field).length : 0,
    created_at: new Date().toISOString(),
  } as Tag;
  try {
    await table<Tag>('tags').insert({ ...row, ...(await iconFor(formData, name)) });
  } catch {
    // Database predates migration 023 (no icon column): save the tag without its icon rather than fail.
    await table<Tag>('tags').insert(row);
  }
  refresh();
}

/** Turn a tag into a field (own page + targets) or back into a plain tag. */
export async function setTagIsField(id: string, isField: boolean): Promise<void> {
  const owner = await requireOwner();
  const t = await table<Tag>('tags').find(id);
  if (!t || t.owner_id !== owner || t.special) return; // the TPN field is always a field
  await table<Tag>('tags').update(id, { is_field: isField });
  refresh();
}

export async function setTagColor(id: string, color: string): Promise<void> {
  const owner = await requireOwner();
  const t = await table<Tag>('tags').find(id);
  if (!t || t.owner_id !== owner || !isHex(color)) return;
  await table<Tag>('tags').update(id, { color });
  refresh();
}

/**
 * Delete a tag. Goals and projects that pointed at it simply lose the field
 * (they are never deleted). Clients keep the label on their record — it just
 * stops being offered. The TPN field can't be deleted.
 */
export async function deleteTag(id: string): Promise<void> {
  const owner = await requireOwner();
  const t = await table<Tag>('tags').find(id);
  if (!t || t.owner_id !== owner || t.special) return;
  type Linked = { id: string; owner_id: string; field_id?: string | null };
  for (const name of ['goals', 'projects'] as const) {
    const rows = await table<Linked>(name).where((r) => r.owner_id === owner && r.field_id === id);
    for (const r of rows) await table<Linked>(name).update(r.id, { field_id: null });
  }
  await table<Tag>('tags').remove(id);
  refresh();
}

/** Put a project in a field (or take it out with an empty field_id). Form: project_id, field_id. */
export async function setProjectField(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const projectId = String(formData.get('project_id') ?? '').trim();
  const fieldId = String(formData.get('field_id') ?? '').trim();
  const project = projectId ? await table<{ id: string; owner_id: string }>('projects').find(projectId) : undefined;
  if (!project || project.owner_id !== owner) return;
  let field_id: string | null = null;
  if (fieldId) {
    const tag = await table<Tag>('tags').find(fieldId);
    if (!tag || tag.owner_id !== owner) return;
    field_id = tag.id;
  }
  await table<{ id: string; field_id?: string | null }>('projects').update(projectId, { field_id });
  refresh();
  revalidatePath('/fields/[id]', 'page');
  revalidatePath('/tpn-audits');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
}

/**
 * New project inside a field. Pick a client and it becomes paid client work
 * (the 'client' type is what unlocks quotes and invoices); leave the client
 * empty and it is simply your own project. Form: name, client_id.
 */
export async function createFieldProject(fieldId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const field = await table<Tag>('tags').find(fieldId);
  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  if (!field || field.owner_id !== owner || !field.is_field || !name) return;

  let clientId: string | null = null;
  const clientRaw = String(formData.get('client_id') ?? '').trim();
  if (clientRaw) {
    const c = await table<{ id: string; owner_id: string }>('clients').find(clientRaw);
    if (c && c.owner_id === owner) clientId = c.id;
  }
  const fieldType = fieldProjectType(field);
  await createProjectRecord(owner, {
    name,
    type: clientId ? 'client' : fieldType,
    extraTypes: clientId ? [fieldType] : [],
    clientId,
    fieldId: field.id,
  });
  refresh();
  revalidatePath('/projects');
  revalidatePath('/fields/[id]', 'page');
  revalidatePath('/tpn-audits');
  revalidatePath('/bounty-pipeline');
}

/** Change a tag's icon. Form: icon. */
export async function setTagIcon(id: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const icon = String(formData.get('icon') ?? '');
  const t = await table<Tag>('tags').find(id);
  if (!t || t.owner_id !== owner || !isIconKey(icon)) return;
  await table<Tag>('tags').update(id, { icon });
  refresh();
}

type ClientTags = { id: string; owner_id: string; work_types?: string[] };

/** Rewrite one tag name to another in every client's Type of work. */
async function retagClients(owner: string, from: string, to: string): Promise<void> {
  const clients = await table<ClientTags>('clients').where((c) => c.owner_id === owner && (c.work_types ?? []).some((t) => t.toLowerCase() === from.toLowerCase()));
  for (const c of clients) await table<ClientTags>('clients').update(c.id, { work_types: replaceTagInList(c.work_types ?? [], from, to) });
}

/** Rename a tag everywhere — the tag itself and every client that carries it. Form: name. */
export async function renameTag(id: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const t = await table<Tag>('tags').find(id);
  if (!t || t.owner_id !== owner) return;
  const name = normaliseTagName(String(formData.get('name') ?? ''));
  const all = await table<Tag>('tags').where((x) => x.owner_id === owner && x.id !== id);
  if (renameProblem(name, all.map((x) => x.name)) || name === t.name) return;
  await table<Tag>('tags').update(id, { name });
  await retagClients(owner, t.name, name);
  refresh();
  revalidatePath('/fields/[id]', 'page');
}

/**
 * Merge a tag into another: clients, goals and projects move to the target,
 * then the source tag is removed. The TPN / Bug Bounty fields can't be merged away.
 * Form: into (the surviving tag's id).
 */
export async function mergeTag(sourceId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const [src, dst] = await Promise.all([table<Tag>('tags').find(sourceId), table<Tag>('tags').find(String(formData.get('into') ?? ''))]);
  if (!src || !dst || src.id === dst.id || src.owner_id !== owner || dst.owner_id !== owner || src.special) return;
  await retagClients(owner, src.name, dst.name);
  type Linked = { id: string; owner_id: string; field_id?: string | null };
  for (const name of ['goals', 'projects'] as const) {
    const rows = await table<Linked>(name).where((r) => r.owner_id === owner && r.field_id === src.id);
    for (const r of rows) await table<Linked>(name).update(r.id, { field_id: dst.is_field ? dst.id : null });
  }
  if (src.is_field && !dst.is_field) await table<Tag>('tags').update(dst.id, { is_field: true });
  await table<Tag>('tags').remove(src.id);
  refresh();
  revalidatePath('/fields/[id]', 'page');
}
