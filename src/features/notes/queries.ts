import { table } from '@/lib/data';
import type { Note } from './types';

export async function getNotes(ownerId: string): Promise<Note[]> {
  const notes = await table<Note>('notes').where((n) => n.owner_id === ownerId);
  return notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  return table<Note>('notes').find(id);
}

export async function getNotesForProject(projectId: string): Promise<Note[]> {
  return table<Note>('notes').where((n) => n.project_id === projectId);
}
