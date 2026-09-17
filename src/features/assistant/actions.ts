'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { writeVaultNote } from '@/lib/vault/local-vault';
import { todayIso } from '@/lib/tz/today';
import { getProjectById } from '@/features/projects/queries';
import { getClientById } from '@/features/clients/queries';
import { getSkill } from './skills';
import { runSkill, buildPayload, type SkillRunResult } from './runner';
import type { Note } from '@/features/notes/types';
import type { Task } from '@/features/today/types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/**
 * Run a skill and file whatever it produced: a note (plus a real .md in the
 * vault), tasks in the brain dump, or text straight back to the caller.
 * Everything lands through the same tables the UI writes to, so a generated
 * document is an ordinary note you can edit, rename or delete.
 */
export async function runSkillAction(formData: FormData): Promise<SkillRunResult> {
  const owner = await requireOwner();
  const skillId = String(formData.get('skill') ?? '');
  const projectId = String(formData.get('project_id') ?? '').trim() || null;
  const clientId = String(formData.get('client_id') ?? '').trim() || null;
  const input = String(formData.get('input') ?? '').trim();

  const skill = getSkill(skillId);
  if (!skill) return { ok: false, error: 'Unknown skill.' };

  const result = await runSkill(skillId, owner, { projectId, clientId, input });
  if (!result.ok) return result;

  if (skill.output === 'tasks' && result.tasks?.length) {
    const now = new Date().toISOString();
    for (const title of result.tasks) {
      await table<Task>('tasks').insert({
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        owner_id: owner,
        project_id: projectId,
        title,
        dump_date: todayIso(),
        scheduled_date: null,
        scheduled_hour: null,
        duration_hours: 1,
        done: false,
        created_at: now,
      });
    }
    revalidatePath('/today');
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return result;
  }

  if (skill.output === 'note' && result.content) {
    const payload = await buildPayload(owner, { projectId, clientId, input });
    const title = skill.noteTitle?.(payload) ?? skill.label;
    const links: string[] = [];

    if (projectId) {
      const project = await getProjectById(projectId);
      if (project) links.push(project.name);
    }
    if (clientId) {
      const client = await getClientById(clientId);
      if (client) links.push(client.name);
    }

    const vault_path = writeVaultNote({
      title,
      folder: skill.noteFolder ?? 'Notes',
      tags: skill.tags ?? [],
      content: result.content,
      links,
    });

    const note = await table<Note>('notes').insert({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      owner_id: owner,
      project_id: projectId,
      client_id: clientId,
      title,
      vault_path,
      tags: skill.tags ?? [],
      synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    revalidatePath('/notes');
    if (projectId) revalidatePath(`/projects/${projectId}`);
    if (clientId) revalidatePath(`/clients/${clientId}`);

    return { ...result, noteId: note.id, notePath: vault_path };
  }

  return result;
}
