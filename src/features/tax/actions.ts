'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';

export interface TdsCheck { id: string; owner_id: string; client_id: string; fy: number; matched: boolean; created_at: string }

/** Tick / untick "matched against Form 26AS" for a client in a financial year. */
export async function setTdsMatched(clientId: string, fy: number, matched: boolean): Promise<void> {
  const owner = await getSessionEmail();
  if (!owner) throw new Error('Not authenticated');
  const client = await table<{ id: string; owner_id: string }>('clients').find(clientId);
  if (!client || client.owner_id !== owner || !Number.isInteger(fy)) return;
  const existing = (await table<TdsCheck>('tds_checks').where((c) => c.owner_id === owner && c.client_id === clientId && c.fy === fy))[0];
  if (existing) await table<TdsCheck>('tds_checks').update(existing.id, { matched });
  else await table<TdsCheck>('tds_checks').insert({ id: newId(), owner_id: owner, client_id: clientId, fy, matched, created_at: new Date().toISOString() });
  revalidatePath('/billing/tax');
}
