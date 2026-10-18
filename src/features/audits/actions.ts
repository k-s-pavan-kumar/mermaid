'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import { todayIso } from '@/lib/tz/today';
import type { Goal } from '@/features/goals/types';
import { monthKey } from '@/features/goals/types';
import { AUDIT_STAGES, type Audit, type AuditStage } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

const text = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max) || null;
const money = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const day = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

function refresh() {
  revalidatePath('/tpn-audits');
  revalidatePath('/goals');
}

/** Goal + month from the form. The month must sit inside the goal's year, so it is built from the goal. */
async function readGoal(owner: string, fd: FormData): Promise<{ goal_id: string | null; goal_month: string | null }> {
  const id = String(fd.get('goal_id') ?? '').trim();
  if (!id) return { goal_id: null, goal_month: null };
  const goal = await table<Goal>('goals').find(id);
  if (!goal || goal.owner_id !== owner) return { goal_id: null, goal_month: null };
  return { goal_id: goal.id, goal_month: monthKey(goal.year, String(fd.get('goal_month') ?? '')) };
}

export async function addAudit(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const client_name = text(formData, 'client_name', 120);
  if (!client_name) return;
  await table<Audit>('audits').insert({
    id: newId(), owner_id: owner, client_name,
    company: text(formData, 'company', 120), email: text(formData, 'email', 120), phone: text(formData, 'phone', 40),
    scope: text(formData, 'scope', 300), stage: 'lead',
    quote_amount: null, quote_sent_on: null, quote_ref: null,
    invoice_amount: null, invoice_ref: null, invoice_sent_on: null,
    paid_amount: 0, paid_on: null, audit_date: day(formData, 'audit_date'),
    ...(await readGoal(owner, formData)),
    notes: text(formData, 'notes', 1000), created_at: new Date().toISOString(),
  });
  refresh();
}

/** Save everything on the audit's details panel in one go (client, quote, invoice, payment, goal). */
export async function updateAudit(id: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const row = await table<Audit>('audits').find(id);
  if (!row || row.owner_id !== owner) return;
  const client_name = text(formData, 'client_name', 120);
  if (!client_name) return;
  const invoice_amount = money(formData, 'invoice_amount');
  const paid_amount = money(formData, 'paid_amount') ?? 0;
  await table<Audit>('audits').update(id, {
    client_name, company: text(formData, 'company', 120), email: text(formData, 'email', 120), phone: text(formData, 'phone', 40),
    scope: text(formData, 'scope', 300), audit_date: day(formData, 'audit_date'),
    quote_amount: money(formData, 'quote_amount'), quote_sent_on: day(formData, 'quote_sent_on'), quote_ref: text(formData, 'quote_ref', 60),
    invoice_amount, invoice_ref: text(formData, 'invoice_ref', 60), invoice_sent_on: day(formData, 'invoice_sent_on'),
    paid_amount, paid_on: day(formData, 'paid_on') ?? (paid_amount > 0 ? todayIso() : null),
    ...(await readGoal(owner, formData)),
    notes: text(formData, 'notes', 1000),
  });
  refresh();
}

export async function setAuditStage(id: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const stage = String(formData.get('stage') ?? '') as AuditStage;
  const row = await table<Audit>('audits').find(id);
  if (!row || row.owner_id !== owner || !AUDIT_STAGES.includes(stage)) return;
  await table<Audit>('audits').update(id, { stage });
  refresh();
}

export async function deleteAudit(id: string): Promise<void> {
  const owner = await requireOwner();
  const row = await table<Audit>('audits').find(id);
  if (!row || row.owner_id !== owner) return;
  await table<Audit>('audits').remove(id);
  refresh();
}
