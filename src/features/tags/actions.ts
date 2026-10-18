'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import { TAG_COLORS, isHex, normaliseTagName, type Tag } from './types';

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
  await table<Tag>('tags').insert({
    id: newId(), owner_id: owner, name, color: isHex(color) ? color : TAG_COLORS[all.length % TAG_COLORS.length]!,
    is_field: isField, special: null,
    sort_order: isField ? all.filter((t) => t.is_field).length : 0,
    created_at: new Date().toISOString(),
  });
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
