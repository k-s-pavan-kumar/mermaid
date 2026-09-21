import { table } from '@/lib/data';
import type { Note } from './types';

/**
 * notes has a unique index on (owner_id, vault_path), so two notes with the
 * same title in the same folder would make the second insert fail. Returns
 * the title unchanged when free, otherwise "Title (2)", "Title (3)", …
 */
export async function uniqueNoteTitle(ownerId: string, folder: string, title: string): Promise<string> {
  const rows = await table<Note>('notes').where((n) => n.owner_id === ownerId);
  const taken = new Set(rows.map((n) => n.vault_path.toLowerCase()));
  const path = (t: string) => `${folder}/${t.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ')}.md`.toLowerCase();
  if (!taken.has(path(title))) return title;
  for (let i = 2; i < 500; i++) {
    const candidate = `${title} (${i})`;
    if (!taken.has(path(candidate))) return candidate;
  }
  return `${title} (${Date.now()})`;
}
