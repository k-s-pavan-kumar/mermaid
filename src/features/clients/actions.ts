'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { BillingType, Client, ClientStatus, WorkType } from './types';
import { todayIso } from '@/lib/tz/today';
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
  const billing_type: BillingType = String(formData.get('billing_type') ?? '') === 'monthly' ? 'monthly' : 'project';
  const monthly = billing_type === 'monthly';

  // <input type="month"> posts 'YYYY-MM'; stored as the 1st of that month.
  const startRaw = String(formData.get('retainer_start') ?? '').trim();
  const retainer_start = monthly
    ? /^\d{4}-(0[1-9]|1[0-2])$/.test(startRaw) ? `${startRaw}-01` : `${todayIso().slice(0, 7)}-01`
    : null;
  const feeRaw = String(formData.get('monthly_fee') ?? '').trim();
  const dayRaw = Math.round(Number(formData.get('retainer_due_day') ?? 5)) || 5;

  return {
    billing_type,
    // Only the fields for the chosen billing type are kept; the other is cleared.
    project_cost: !monthly && costRaw ? Number(costRaw) || null : null,
    monthly_fee: monthly && feeRaw ? Number(feeRaw) || null : null,
    retainer_start,
    retainer_due_day: monthly ? Math.min(28, Math.max(1, dayRaw)) : null,
    company: String(formData.get('company') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    timezone: String(formData.get('timezone') ?? 'UTC').trim() || 'UTC',
    work_types: readWorkTypes(formData),
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
