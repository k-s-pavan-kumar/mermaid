'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { todayIso } from '@/lib/tz/today';
import { grandTotal, subtotal, type IncomeStream, type Invoice, type LineItem, type Quote } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  });

  await table<Quote>('quotes').update(quoteId, { status: 'accepted' });

  revalidatePath('/billing');
  return invoice.id;
}

export async function markInvoicePaid(invoiceId: string): Promise<void> {
  await requireOwner();
  const inv = await table<Invoice>('invoices').update(invoiceId, {
    status: 'paid',
    paid_at: todayIso(),
  });
  revalidatePath('/billing');
  if (inv?.project_id) revalidatePath(`/projects/${inv.project_id}`);
  if (inv?.client_id) revalidatePath(`/clients/${inv.client_id}`);
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
