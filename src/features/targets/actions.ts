'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import type { Tag } from '@/features/tags/types';
import type { FieldTarget, FieldCost } from './queries';
import { WEIGHT_PRESETS } from './compute';
import { createProjectRecord } from '@/features/projects/service';
import { fieldProjectType } from '@/features/tags/types';
import { normaliseWorkTags } from '@/features/clients/types';
import type { Invoice } from '@/features/billing/types';
import { todayIso } from '@/lib/tz/today';

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
  refreshTargets();
}

function refreshTargets() {
  revalidatePath('/goals');
  revalidatePath('/fields/[id]', 'page');
  revalidatePath('/products/[id]', 'page');
  revalidatePath('/tpn-audits');
  revalidatePath('/bounty-pipeline');
  revalidatePath('/digest');
}

async function owner(): Promise<string> {
  const o = await getSessionEmail();
  if (!o) throw new Error('Not authenticated');
  return o;
}

/**
 * Shape a field's yearly plan (the dashed line): pick a preset, or give 12
 * monthly weights. Only the *shape* changes — the total stays the goal.
 * Form: field_id, year, preset | w1..w12.
 */
export async function setFieldShape(formData: FormData): Promise<void> {
  const o = await owner();
  const fieldId = String(formData.get('field_id') ?? '');
  const year = Math.round(Number(formData.get('year')));
  const row = (await table<FieldTarget>('field_targets').where((t) => t.owner_id === o && t.field_id === fieldId && t.year === year))[0];
  if (!row) return; // set a goal first
  const preset = WEIGHT_PRESETS.find((p) => p.key === String(formData.get('preset') ?? ''));
  const custom = Array.from({ length: 12 }, (_, i) => Number(String(formData.get(`w${i + 1}`) ?? '').trim() || NaN));
  const weights = preset ? (preset.key === 'even' ? null : preset.weights)
    : custom.every((x) => Number.isFinite(x) && x >= 0) && custom.some((x) => x > 0) ? custom : undefined;
  if (weights === undefined) return;
  await table<FieldTarget>('field_targets').update(row.id, { weights });
  refreshTargets();
}

/** Record a business cost against a field and/or product. Form: label, amount, date, field_id?, product_id?. */
export async function addFieldCost(formData: FormData): Promise<void> {
  const o = await owner();
  const label = String(formData.get('label') ?? '').trim().slice(0, 100);
  const amount = Number(String(formData.get('amount') ?? '').replace(/[,₹\s]/g, ''));
  const date = String(formData.get('date') ?? '').trim() || todayIso();
  if (!label || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const fieldRaw = String(formData.get('field_id') ?? '').trim();
  const productRaw = String(formData.get('product_id') ?? '').trim();
  let field_id: string | null = null, product_id: string | null = null;
  if (fieldRaw) { const t = await table<Tag>('tags').find(fieldRaw); if (t && t.owner_id === o) field_id = t.id; }
  if (productRaw) { const p = await table<{ id: string; owner_id: string; field_id?: string }>('products').find(productRaw); if (p && p.owner_id === o) product_id = p.id; }
  if (!field_id && !product_id) return;
  await table<FieldCost>('field_costs').insert({ id: newId(), owner_id: o, field_id, product_id, date, amount, label, created_at: new Date().toISOString() });
  refreshTargets();
}

export async function deleteFieldCost(id: string): Promise<void> {
  const o = await owner();
  const row = await table<FieldCost>('field_costs').find(id);
  if (!row || row.owner_id !== o) return;
  await table<FieldCost>('field_costs').remove(id);
  refreshTargets();
}

/**
 * One-click: put the money from this invoice into a field. Uses the least
 * invasive link that works — the invoice's project goes into the field; else
 * the client gets the field's tag; else a project is made for the invoice.
 * Everything else on that project / client follows along, which is the point.
 */
export async function assignInvoiceToField(invoiceId: string, formData: FormData): Promise<void> {
  const o = await owner();
  const fieldId = String(formData.get('field_id') ?? '').trim();
  const [inv, field] = await Promise.all([table<Invoice>('invoices').find(invoiceId), table<Tag>('tags').find(fieldId)]);
  if (!inv || inv.owner_id !== o || !field || field.owner_id !== o || !field.is_field) return;
  if (inv.project_id) {
    await table<{ id: string; field_id?: string | null }>('projects').update(inv.project_id, { field_id: field.id });
  } else if (inv.client_id) {
    const client = await table<{ id: string; owner_id: string; work_types?: string[] }>('clients').find(inv.client_id);
    if (client && client.owner_id === o) await table<{ id: string; work_types?: string[] }>('clients').update(client.id, { work_types: normaliseWorkTags([...(client.work_types ?? []), field.name]) });
  } else {
    const { project } = await createProjectRecord(o, { name: (inv.description || `Invoice ${inv.number}`).slice(0, 120), type: fieldProjectType(field), fieldId: field.id });
    await table<Invoice>('invoices').update(inv.id, { project_id: project.id });
  }
  refreshTargets();
  revalidatePath('/billing');
  revalidatePath('/projects');
  revalidatePath('/clients', 'layout');
}
