'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { AlertState } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

// Upsert by composite id so repeated actions on the same alert don't pile
// up rows — the id is deterministic, not random.
async function setState(alertKey: string, patch: Partial<AlertState>): Promise<void> {
  const owner_id = await requireOwner();
  const id = `${owner_id}:${alertKey}`;
  const existing = await table<AlertState>('alert_states').find(id);

  if (existing) {
    await table<AlertState>('alert_states').update(id, { ...patch, updated_at: new Date().toISOString() });
  } else {
    await table<AlertState>('alert_states').insert({
      id,
      owner_id,
      alert_key: alertKey,
      read: false,
      dismissed: false,
      snoozed_until: null,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath('/notifications');
  revalidatePath('/today');
}

export async function markAlertRead(alertKey: string): Promise<void> {
  await setState(alertKey, { read: true });
}

export async function dismissAlert(alertKey: string): Promise<void> {
  await setState(alertKey, { dismissed: true, read: true });
}

export async function snoozeAlert(alertKey: string, days = 3): Promise<void> {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  await setState(alertKey, { snoozed_until: until, read: true });
}

export async function restoreAlert(alertKey: string): Promise<void> {
  await setState(alertKey, { dismissed: false, snoozed_until: null });
}

export async function markAllRead(alertKeys: string[]): Promise<void> {
  for (const key of alertKeys) await setState(key, { read: true });
}
