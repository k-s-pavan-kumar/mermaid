'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { todayIso } from '@/lib/tz/today';
import { balanceDue, grandTotal, subtotal, type IncomeStream, type Invoice, type LineItem, type Quote } from './types';
import { categoryForProjectType, type FinanceEntry } from '@/features/daily-finance/types';
import type { Project } from '@/features/projects/types';
import type { Client } from '@/features/clients/types';
import { newId } from '@/lib/id';

const STREAM_CATEGORY: Record<IncomeStream, string> = {
  freelance: 'Freelance royalty',
  teaching: 'Institute payment',
  product: 'Product income',
  bounty: 'Bug bounty',
  other: 'Other income',
};

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/**
 * Line items post as parallel arrays (item_description[], item_qty[], ...)
 * because that's what a plain HTML form with repeatable rows produces —
 * no client-side serialisation, so the form still works if JS hasn't loaded.
 * Rows with no description and no amount are dropped rather than saved blank.
 */
function readItems(formData: FormData): LineItem[] {
  const descriptions = formData.getAll('item_description').map(String);
  const qtys = formData.getAll('item_qty').map((v) => Number(v) || 0);
  const rates = formData.getAll('item_rate').map((v) => Number(v) || 0);
  const units = formData.getAll('item_unit').map(String);

  return descriptions
    .map((description, i) => ({
      description: description.trim(),
      qty: qtys[i] ?? 1,
      rate: rates[i] ?? 0,
      unit: (units[i] ?? '').trim() || 'item',
    }))
    .filter((i) => i.description !== '' || i.rate !== 0);
}

/**
 * Sequential per-year numbering: INV-2026-001. Derived from what's already
 * stored rather than a counter, so it can't drift out of sync with reality
 * if a document is deleted or the database is restored.
 */
async function nextNumber(prefix: string, rows: { number: string }[]): Promise<string> {
  const year = todayIso().slice(0, 4);
  const stem = `${prefix}-${year}-`;
  const highest = rows
    .map((r) => r.number)
    .filter((n) => n.startsWith(stem))
    .map((n) => Number(n.slice(stem.length)) || 0)
    .reduce((max, n) => Math.max(max, n), 0);

  return `${stem}${String(highest + 1).padStart(3, '0')}`;
}

async function baseFields(formData: FormData, owner: string) {
  const settings = await getSettings(owner);
  const items = readItems(formData);
  const explicitAmount = Number(formData.get('amount') ?? 0) || 0;
  const taxRaw = formData.get('tax_pct');

  return {
    owner_id: owner,
    project_id: String(formData.get('project_id') ?? '').trim() || null,
    client_id: String(formData.get('client_id') ?? '').trim() || null,
    stream: (String(formData.get('stream') ?? 'freelance') as IncomeStream),
    description: String(formData.get('description') ?? '').trim() || null,
    items,
    amount: items.length > 0 ? subtotal({ items, amount: 0 }) : explicitAmount,
    tax_pct: taxRaw === null || String(taxRaw).trim() === ''
      ? settings.business.default_tax_pct
      : Math.min(100, Math.max(0, Number(taxRaw) || 0)),
    currency: String(formData.get('currency') ?? 'INR').trim() || 'INR',
    notes: String(formData.get('notes') ?? '').trim() || null,
    issued_at: String(formData.get('issued_at') ?? '').trim() || todayIso(),
    settings,
  };
}

export async function createQuote(formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  const base = await baseFields(formData, owner);
  if (base.amount <= 0) return null;

  const existing = await table<Quote>('quotes').all();
  const number =
    String(formData.get('number') ?? '').trim() ||
    (await nextNumber(base.settings.business.quote_prefix, existing));

  const { settings: _settings, ...fields } = base;
  const quote = await table<Quote>('quotes').insert({
    id: newId('quote'),
    ...fields,
    number,
    status: (String(formData.get('status') ?? 'draft') as Quote['status']),
    valid_until: String(formData.get('valid_until') ?? '').trim() || null,
  });

  revalidatePath('/billing');
  if (quote.project_id) revalidatePath(`/projects/${quote.project_id}`);
  if (quote.client_id) revalidatePath(`/clients/${quote.client_id}`);
  return quote.id;
}

export async function createInvoice(formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  const base = await baseFields(formData, owner);
  if (base.amount <= 0) return null;

  const existing = await table<Invoice>('invoices').all();
  const number =
    String(formData.get('number') ?? '').trim() ||
    (await nextNumber(base.settings.business.invoice_prefix, existing));

  const { settings: _settings, ...fields } = base;
  const invoice = await table<Invoice>('invoices').insert({
    id: newId('inv'),
    ...fields,
    quote_id: String(formData.get('quote_id') ?? '').trim() || null,
    number,
    status: (String(formData.get('status') ?? 'pending') as Invoice['status']),
    due_at: String(formData.get('due_at') ?? '').trim() || null,
    paid_at: null,
    tds_amount: 0,
  });

  revalidatePath('/billing');
  if (invoice.project_id) revalidatePath(`/projects/${invoice.project_id}`);
  if (invoice.client_id) revalidatePath(`/clients/${invoice.client_id}`);
  return invoice.id;
}

/** Accepted quote → invoice, carrying the line items across verbatim. The
 *  most common billing step there is, and retyping it invites typos. */
export async function convertQuoteToInvoice(quoteId: string): Promise<string | null> {
  const owner = await requireOwner();
  const quote = await table<Quote>('quotes').find(quoteId);
  if (!quote) return null;

  const settings = await getSettings(owner);
  const existing = await table<Invoice>('invoices').all();

  const invoice = await table<Invoice>('invoices').insert({
    id: newId('inv'),
    owner_id: owner,
    project_id: quote.project_id,
    client_id: quote.client_id,
    stream: quote.stream,
    number: await nextNumber(settings.business.invoice_prefix, existing),
    description: quote.description,
    items: quote.items ?? [],
    amount: quote.amount,
    tax_pct: quote.tax_pct ?? 0,
    currency: quote.currency,
    notes: quote.notes,
    issued_at: todayIso(),
    quote_id: quote.id,
    status: 'pending',
    due_at: null,
    paid_at: null,
    tds_amount: 0,
  });

  await table<Quote>('quotes').update(quoteId, { status: 'accepted' });

  revalidatePath('/billing');
  return invoice.id;
}

/** Sum of every payment already recorded against this invoice. */
async function paidSoFar(ownerId: string, invoiceId: string): Promise<number> {
  const entries = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_payment' && e.linked_invoice_id === invoiceId
  );
  return Math.round(entries.reduce((n, e) => n + e.amount, 0) * 100) / 100;
}

/**
 * Records one real payment against an invoice — posts a FinanceEntry (this
 * is the one and only place a real income entry gets created for invoiced
 * work) and, from the running total of every payment recorded so far,
 * updates the invoice to 'partial' or 'paid'. An invoice can take any
 * number of these, exactly like a due in Daily Finance can take several
 * payments before it's cleared.
 */
async function applyInvoicePayment(
  owner: string,
  inv: Invoice,
  amount: number,
  date: string,
  note: string | null
): Promise<void> {
  let category = STREAM_CATEGORY[inv.stream] ?? 'Other income';
  let projectName: string | null = null;
  if (inv.project_id) {
    const project = await table<Project>('projects').find(inv.project_id);
    if (project) {
      category = categoryForProjectType(project.type);
      projectName = project.name;
    }
  }
  if (!projectName && inv.client_id) {
    const client = await table<Client>('clients').find(inv.client_id);
    projectName = client?.name ?? null;
  }

  await table<FinanceEntry>('finance_entries').insert({
    id: newId(),
    owner_id: owner,
    date,
    type: 'income',
    category,
    amount: Math.max(0, amount),
    note: note || inv.description || (projectName ? `${projectName} — invoice ${inv.number}` : `Invoice ${inv.number}`),
    source: 'invoice_payment',
    created_at: new Date().toISOString(),
    linked_project_id: inv.project_id ?? null,
    linked_invoice_id: inv.id,
    tds_amount: null,
  });

  const paid = await paidSoFar(owner, inv.id);
  const remaining = balanceDue(inv, paid);
  const status: Invoice['status'] = remaining <= 0 ? 'paid' : 'partial';
  await table<Invoice>('invoices').update(inv.id, {
    status,
    paid_at: status === 'paid' ? date : null,
  });

  revalidatePath('/billing');
  revalidatePath(`/billing/invoices/${inv.id}`);
  if (inv.project_id) revalidatePath(`/projects/${inv.project_id}`);
  if (inv.client_id) revalidatePath(`/clients/${inv.client_id}`);
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/** One click: pays off whatever is still owed, today, in a single payment.
 *  Unchanged behaviour for an invoice with no partial payments on it yet —
 *  still the fastest way to record a fully-settled invoice. */
export async function markInvoicePaid(invoiceId: string): Promise<void> {
  const owner = await requireOwner();
  const inv = await table<Invoice>('invoices').find(invoiceId);
  if (!inv || inv.owner_id !== owner) return;

  const paid = await paidSoFar(owner, inv.id);
  const remaining = balanceDue(inv, paid);
  if (remaining <= 0) {
    // Already fully covered by payments on file — just make sure the
    // status agrees; no new money actually came in.
    await table<Invoice>('invoices').update(inv.id, { status: 'paid', paid_at: inv.paid_at ?? todayIso() });
    revalidatePath('/billing');
    revalidatePath(`/billing/invoices/${inv.id}`);
    return;
  }
  await applyInvoicePayment(owner, inv, remaining, todayIso(), null);
}

/** Records a partial (or full) payment with its own date, from the "Add
 *  payment" form on the invoice page — for the common case of a client
 *  paying an invoice in installments. */
export async function recordInvoicePayment(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const invoiceId = String(formData.get('invoice_id') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim() || todayIso();
  const amount = Number(formData.get('amount') ?? 0);
  const note = String(formData.get('note') ?? '').trim();
  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) return;

  const inv = await table<Invoice>('invoices').find(invoiceId);
  if (!inv || inv.owner_id !== owner) return;

  await applyInvoicePayment(owner, inv, amount, date, note || null);
}

/** Undoes a mistaken payment — removes the FinanceEntry and re-derives the
 *  invoice's status/paid_at from whatever payments are left. */
export async function deleteInvoicePayment(paymentId: string): Promise<void> {
  const owner = await requireOwner();
  const entry = await table<FinanceEntry>('finance_entries').find(paymentId);
  if (!entry || entry.owner_id !== owner || entry.source !== 'invoice_payment' || !entry.linked_invoice_id) return;

  const invoiceId = entry.linked_invoice_id;
  await table<FinanceEntry>('finance_entries').remove(paymentId);

  const inv = await table<Invoice>('invoices').find(invoiceId);
  if (inv) {
    const paid = await paidSoFar(owner, invoiceId);
    const remaining = balanceDue(inv, paid);
    const status: Invoice['status'] = paid <= 0 ? 'pending' : remaining <= 0 ? 'paid' : 'partial';
    await table<Invoice>('invoices').update(invoiceId, {
      status,
      paid_at: status === 'paid' ? (inv.paid_at ?? todayIso()) : null,
    });
    revalidatePath(`/billing/invoices/${invoiceId}`);
    if (inv.project_id) revalidatePath(`/projects/${inv.project_id}`);
    if (inv.client_id) revalidatePath(`/clients/${inv.client_id}`);
  }
  revalidatePath('/billing');
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/**
 * Records (or corrects) how much TDS a client deducted on this invoice.
 * Editable any time — most people only learn the exact figure once the
 * payment lands and Form 16A/26AS shows it, well after "mark paid". If the
 * invoice is already paid, the already-posted Daily Finance entry is kept
 * in sync so the ledger never drifts from what this says.
 */
export async function setInvoiceTds(invoiceId: string, tdsAmount: number): Promise<void> {
  const owner = await requireOwner();
  const clean = Number.isFinite(tdsAmount) && tdsAmount > 0 ? tdsAmount : 0;
  const inv = await table<Invoice>('invoices').update(invoiceId, { tds_amount: clean });
  if (!inv || inv.owner_id !== owner) return;

  const entries = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === owner && e.source === 'invoice_payment' && e.linked_invoice_id === invoiceId
  );

  if (inv.status === 'paid' && entries.length === 1) {
    // The common case, unchanged from before partial payments existed: one
    // payment covers the whole invoice, so keep its recorded amount net of
    // TDS in sync as the TDS figure is corrected.
    await table<FinanceEntry>('finance_entries').update(entries[0].id, {
      amount: Math.max(0, grandTotal(inv) - clean),
      tds_amount: clean > 0 ? clean : null,
    });
  } else if (entries.length > 0) {
    // Several payments on file — each already records the real cash that
    // came in, so leave them alone and just re-derive the status/paid_at
    // now that less (or more) is owed overall.
    const paid = Math.round(entries.reduce((n, e) => n + e.amount, 0) * 100) / 100;
    const remaining = balanceDue({ ...inv, tds_amount: clean }, paid);
    const status: Invoice['status'] = remaining <= 0 ? 'paid' : 'partial';
    await table<Invoice>('invoices').update(invoiceId, {
      status,
      paid_at: status === 'paid' ? (inv.paid_at ?? todayIso()) : null,
    });
  }

  revalidatePath(`/billing/invoices/${invoiceId}`);
  revalidatePath('/billing');
  revalidatePath('/daily-finance');
}

export async function setDocStatus(kind: 'invoice' | 'quote', id: string, status: string): Promise<void> {
  await requireOwner();
  if (kind === 'invoice') await table<Invoice>('invoices').update(id, { status: status as Invoice['status'] });
  else await table<Quote>('quotes').update(id, { status: status as Quote['status'] });
  revalidatePath('/billing');
}

export async function deleteDoc(kind: 'invoice' | 'quote', id: string): Promise<void> {
  await requireOwner();
  await table<{ id: string }>(kind === 'invoice' ? 'invoices' : 'quotes').remove(id);
  revalidatePath('/billing');
}

/* ------------------------------------------------------------------ *
 * Project-scoped wrappers — kept so the project detail page's existing
 * forms keep working unchanged; they just pin project_id.
 * ------------------------------------------------------------------ */

export async function addQuote(projectId: string, formData: FormData): Promise<void> {
  formData.set('project_id', projectId);
  await createQuote(formData);
  revalidatePath(`/projects/${projectId}`);
}

export async function addInvoice(projectId: string, formData: FormData): Promise<void> {
  formData.set('project_id', projectId);
  await createInvoice(formData);
  revalidatePath(`/projects/${projectId}`);
}

export async function markInvoicePaidForProject(projectId: string, invoiceId: string): Promise<void> {
  await markInvoicePaid(invoiceId);
  revalidatePath(`/projects/${projectId}`);
}

export async function totalOf(docId: string, kind: 'invoice' | 'quote'): Promise<number> {
  const doc =
    kind === 'invoice'
      ? await table<Invoice>('invoices').find(docId)
      : await table<Quote>('quotes').find(docId);
  return doc ? grandTotal(doc) : 0;
}


/* Form-friendly wrappers: a <form action> must resolve to void, and after
 * creating a document you almost always want to look at it. */

export async function createInvoiceAndOpen(formData: FormData): Promise<void> {
  const id = await createInvoice(formData);
  if (id) redirect(`/billing/invoices/${id}`);
}

export async function createQuoteAndOpen(formData: FormData): Promise<void> {
  const id = await createQuote(formData);
  if (id) redirect(`/billing/quotes/${id}`);
}

export async function convertQuoteAndOpen(quoteId: string): Promise<void> {
  const id = await convertQuoteToInvoice(quoteId);
  if (id) redirect(`/billing/invoices/${id}`);
}
