'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { todayIso } from '@/lib/tz/today';
import { newId } from '@/lib/id';
import { MAX_ENTRY_CHARS, type JournalEntry } from './types';
import { parseDateParam } from './logic';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/** Add an entry to a day. `date` defaults to today in the home timezone, so a
 *  note typed at 1am IST lands on the right day rather than UTC's yesterday. */
export async function addJournalEntry(formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const content = String(formData.get('content') ?? '').trim().slice(0, MAX_ENTRY_CHARS);
  if (!content) return;

  const entry_date = parseDateParam(formData.get('date'), todayIso());
  const now = new Date().toISOString();

  await table<JournalEntry>('journal_entries').insert({
    id: newId(),
    owner_id,
    entry_date,
    content,
    created_at: now,
    updated_at: now,
  });

  revalidatePath('/journal');
}

export async function updateJournalEntry(id: string, formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const entry = await table<JournalEntry>('journal_entries').find(id);
  if (!entry || entry.owner_id !== owner_id) return;

  const content = String(formData.get('content') ?? '').trim().slice(0, MAX_ENTRY_CHARS);
  // Emptying an entry is a delete in disguise — refuse rather than leave a blank row.
  if (!content || content === entry.content) return;

  await table<JournalEntry>('journal_entries').update(id, {
    content,
    updated_at: new Date().toISOString(),
  });
  revalidatePath('/journal');
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const owner_id = await requireOwner();
  const entry = await table<JournalEntry>('journal_entries').find(id);
  if (!entry || entry.owner_id !== owner_id) return;

  await table<JournalEntry>('journal_entries').remove(id);
  revalidatePath('/journal');
}
