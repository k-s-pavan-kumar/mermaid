'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { writeVaultNote, deleteVaultNote, readVaultNote } from '@/lib/vault/local-vault';
import { getProjectById } from '@/features/projects/queries';
import { getClientById } from '@/features/clients/queries';
import type { Note } from './types';
import { uniqueNoteTitle } from './unique';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

export async function createNote(formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const rawTitle = String(formData.get('title') ?? '').trim();
  const content = String(formData.get('content') ?? '');
  if (!rawTitle) return;

  const project_id = String(formData.get('project_id') ?? '').trim() || null;
  const client_id = String(formData.get('client_id') ?? '').trim() || null;
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const links: string[] = [];
  let folder = 'Notes';
  if (project_id) {
    const project = await getProjectById(project_id);
    if (project) {
      links.push(project.name);
      folder = 'Projects';
    }
  }
  if (client_id) {
    const client = await getClientById(client_id);
    if (client) {
      links.push(client.name);
      if (folder === 'Notes') folder = 'Clients';
    }
  }

  const title = await uniqueNoteTitle(owner_id, folder, rawTitle);
  const vault_path = writeVaultNote({ title, folder, tags, content, links });

  await table<Note>('notes').insert({
    id: newId(),
    owner_id,
    project_id,
    client_id,
    title,
    vault_path,
    tags,
    content,
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  revalidatePath('/notes');
  if (project_id) revalidatePath(`/projects/${project_id}`);
}

export async function updateNoteContent(id: string, formData: FormData): Promise<void> {
  await requireOwner();
  const note = await table<Note>('notes').find(id);
  if (!note) return;

  const content = String(formData.get('content') ?? '');
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const links: string[] = [];
  const folder: string = note.vault_path.split('/')[0] ?? 'Notes';
  if (note.project_id) {
    const project = await getProjectById(note.project_id);
    if (project) links.push(project.name);
  }
  if (note.client_id) {
    const client = await getClientById(note.client_id);
    if (client) links.push(client.name);
  }

  const vault_path = writeVaultNote({ title: note.title, folder, tags, content, links });

  await table<Note>('notes').update(id, { tags, vault_path, content, synced_at: new Date().toISOString() });
  revalidatePath('/notes');
}

export async function deleteNote(id: string): Promise<void> {
  await requireOwner();
  const note = await table<Note>('notes').find(id);
  if (note) deleteVaultNote(note.vault_path);
  await table<Note>('notes').remove(id);
  revalidatePath('/notes');
}

export async function getNoteContent(id: string): Promise<string> {
  await requireOwner();
  const note = await table<Note>('notes').find(id);
  if (!note) return '';
  // The file wins when it exists (you may have edited it in Obsidian);
  // otherwise the copy stored in the database.
  return readVaultNote(note.vault_path) ?? note.content ?? '';
}

/**
 * Reconcile the vault folder with Meridian's note index, in both directions.
 * Run it from the Notes page any time, or after editing in Obsidian.
 *
 *  - Files in the vault with no DB row  → imported (nothing you wrote in
 *    Obsidian is ever invisible to Meridian).
 *  - DB rows whose file is gone         → flagged, NOT deleted. Meridian
 *    never removes a note because a file vanished; a moved file or a
 *    half-finished Obsidian sync would otherwise destroy the record.
 */
export async function syncVault(): Promise<{ imported: number; missing: number }> {
  const owner_id = await requireOwner();
  const { scanVault, vaultFileExists } = await import('@/lib/vault/sync');

  const onDisk = scanVault();
  const rows = await table<Note>('notes').where((n) => n.owner_id === owner_id);
  const knownPaths = new Set(rows.map((r) => r.vault_path));

  let imported = 0;
  for (const file of onDisk) {
    if (knownPaths.has(file.vaultPath)) continue;
    await table<Note>('notes').insert({
      id: newId(),
      owner_id,
      project_id: null,
      client_id: null,
      title: file.title,
      vault_path: file.vaultPath,
      tags: file.tags,
      content: file.body,
      synced_at: new Date().toISOString(),
      created_at: file.mtime,
    });
    imported++;
  }

  const missing = rows.filter((r) => !vaultFileExists(r.vault_path)).length;

  revalidatePath('/notes');
  return { imported, missing };
}

/** Notes whose backing .md file is no longer on disk. Surfaced, never auto-deleted. */
export async function getOrphanedNotes(): Promise<Note[]> {
  const owner_id = await requireOwner();
  const { vaultFileExists } = await import('@/lib/vault/sync');
  const rows = await table<Note>('notes').where((n) => n.owner_id === owner_id);
  return rows.filter((r) => !vaultFileExists(r.vault_path));
}
