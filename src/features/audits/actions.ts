'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { newId } from '@/lib/id';
import { todayIso } from '@/lib/tz/today';
import type { Goal } from '@/features/goals/types';
import { monthKey } from '@/features/goals/types';
import { readChecklist, toggleItem, addItem, removeItem } from '@/features/launch/checklist';
import { createInvoice } from '@/features/billing/actions';
import { createProjectRecord } from '@/features/projects/service';
import type { Invoice } from '@/features/billing/types';
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
  // TPN has its own goals: an audit can only be tied to a goal in the TPN field.
  try {
    const tpn = (await table<{ id: string; owner_id: string; special: string | null }>('tags').where((t) => t.owner_id === owner && t.special === 'tpn'))[0];
    if (tpn && goal.field_id !== tpn.id) return { goal_id: null, goal_month: null };
  } catch { /* tags table not there yet */ }
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

async function ownAudit(owner: string, id: string): Promise<Audit | undefined> {
  const a = await table<Audit>('audits').find(id);
  return a && a.owner_id === owner ? a : undefined;
}

export async function toggleAuditCheck(auditId: string, itemId: string): Promise<void> {
  const owner = await requireOwner();
  const a = await ownAudit(owner, auditId);
  if (!a) return;
  await table<Audit>('audits').update(auditId, { checklist: toggleItem(readChecklist(a.checklist), itemId) });
  refresh();
}

export async function addAuditCheck(auditId: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const a = await ownAudit(owner, auditId);
  if (!a) return;
  await table<Audit>('audits').update(auditId, { checklist: addItem(readChecklist(a.checklist), String(formData.get('label') ?? ''), `c${newId().slice(0, 8)}`) });
  refresh();
}

export async function removeAuditCheck(auditId: string, itemId: string): Promise<void> {
  const owner = await requireOwner();
  const a = await ownAudit(owner, auditId);
  if (!a) return;
  await table<Audit>('audits').update(auditId, { checklist: removeItem(readChecklist(a.checklist), itemId) });
  refresh();
}

/**
 * Turn an audit's quote/invoice into a real invoice in Billing. A project is
 * made in the TPN field for it, so payments flow through Billing → Daily
 * Finance → the yearly targets like any other invoice. From then on Billing
 * owns the money; the audit's own paid/invoice figures stop being counted.
 * Only offered while nothing has been recorded as received on the audit, so
 * no payment is ever counted twice.
 */
export async function createInvoiceFromAudit(auditId: string): Promise<void> {
  const owner = await requireOwner();
  const a = await ownAudit(owner, auditId);
  const amount = a ? a.invoice_amount ?? a.quote_amount ?? 0 : 0;
  if (!a || a.billing_invoice_id || a.paid_amount > 0 || amount <= 0) return;

  const tpn = (await table<{ id: string; owner_id: string; special: string | null }>('tags').where((t) => t.owner_id === owner && t.special === 'tpn'))[0];
  const { project } = await createProjectRecord(owner, { name: `TPN audit — ${a.company || a.client_name}`.slice(0, 120), type: 'assess', fieldId: tpn?.id ?? null });
  const clients = await table<{ id: string; owner_id: string; name: string }>('clients').where((c) => c.owner_id === owner && c.name.toLowerCase() === a.client_name.toLowerCase());

  const fd = new FormData();
  fd.set('project_id', project.id);
  if (clients[0]) fd.set('client_id', clients[0].id);
  fd.set('amount', String(amount));
  fd.set('description', `TPN audit${a.scope ? ` — ${a.scope}` : ''}`);
  fd.set('stream', 'freelance');
  fd.set('status', 'pending');
  fd.set('issued_at', a.invoice_sent_on ?? todayIso());
  const invoiceId = await createInvoice(fd);
  if (!invoiceId) return;
  const inv = await table<Invoice>('invoices').find(invoiceId);
  await table<Audit>('audits').update(auditId, {
    billing_invoice_id: invoiceId, invoice_ref: inv?.number ?? a.invoice_ref,
    stage: a.stage === 'paid' || a.stage === 'lost' ? a.stage : 'invoiced',
  });
  refresh();
  revalidatePath('/billing');
}
