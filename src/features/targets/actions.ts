'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import type { Tag } from '@/features/tags/types';
import type { FieldTarget } from './queries';

/**
 * Set (or clear, with 0 / blank) a field's yearly money target.
 * Form: field_id, year, amount.
 */
export async function setFieldTarget(formData: FormData): Promise<void> {
  const owner = await getSessionEmail();
  if (!owner) throw new Error('Not authenticated');
  const fieldId = String(formData.get('field_id') ?? '');
  const year = Math.round(Number(formData.get('year')));
  const raw = String(formData.get('amount') ?? '').replace(/[,₹\s]/g, '');
  const amount = raw === '' ? 0 : Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isFinite(amount) || amount < 0) return;

  const field = await table<Tag>('tags').find(fieldId);
  if (!field || field.owner_id !== owner || !field.is_field) return;

  const existing = (await table<FieldTarget>('field_targets').where((t) => t.owner_id === owner && t.field_id === fieldId && t.year === year))[0];
  if (amount === 0) {
    if (existing) await table<FieldTarget>('field_targets').remove(existing.id);
  } else if (existing) {
    await table<FieldTarget>('field_targets').update(existing.id, { amount });
  } else {
    await table<FieldTarget>('field_targets').insert({
      id: newId(), owner_id: owner, field_id: fieldId, year, amount, created_at: new Date().toISOString(),
    });
  }
  revalidatePath('/goals');
  revalidatePath('/fields/[id]', 'page');
  revalidatePath('/tpn-audits');
  revalidatePath('/bounty-pipeline');
}
