'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { Client, ClientStatus, WorkType } from './types';
import { WORK_TYPE_LABEL } from './types';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function readWorkTypes(formData: FormData): WorkType[] {
  return formData
    .getAll('work_types')
    .map(String)
    .filter((v): v is WorkType => v in WORK_TYPE_LABEL);
}

function fields(formData: FormData) {
  const costRaw = String(formData.get('project_cost') ?? '').trim();
  return {
    company: String(formData.get('company') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    timezone: String(formData.get('timezone') ?? 'UTC').trim() || 'UTC',
    work_types: readWorkTypes(formData),
    project_cost: costRaw ? Number(costRaw) || null : null,
    status: (String(formData.get('status') ?? 'active') as ClientStatus),
    notes: String(formData.get('notes') ?? '').trim() || null,
  };
}

export async function createClient(formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const client = await table<Client>('clients').insert({
    id: newId(),
    owner_id,
    name,
    ...fields(formData),
    portal_token: null,
    created_at: new Date().toISOString(),
  });

  revalidatePath('/clients');
  redirect(`/clients/${client.id}`);
}

export async function updateClient(id: string, formData: FormData): Promise<void> {
  await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  await table<Client>('clients').update(id, { name, ...fields(formData) });

  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
}

export async function deleteClient(id: string): Promise<void> {
  await requireOwner();
  await table<Client>('clients').remove(id);
  revalidatePath('/clients');
}

export async function deleteClientAndReturn(id: string): Promise<void> {
  await deleteClient(id);
  redirect('/clients');
}

/**
 * Mint (or rotate) the client's portal link. The token is the only
 * credential — anyone holding the URL sees that client's read-only page —
 * so rotating is the revoke button, and it's deliberately long.
 */
export async function rotatePortalToken(id: string): Promise<void> {
  await requireOwner();
  await table<Client>('clients').update(id, { portal_token: crypto.randomBytes(24).toString('base64url') });
  revalidatePath(`/clients/${id}`);
}

export async function revokePortalToken(id: string): Promise<void> {
  await requireOwner();
  await table<Client>('clients').update(id, { portal_token: null });
  revalidatePath(`/clients/${id}`);
}
