import { table } from '@/lib/data';
import { grandTotal, type Invoice, type Quote, type IncomeStream } from './types';
import type { FinanceEntry } from '@/features/daily-finance/types';

export async function getInvoices(ownerId: string): Promise<Invoice[]> {
  const rows = await table<Invoice>('invoices').all();
  return rows
    .filter((i) => !i.owner_id || i.owner_id === ownerId)
    .sort((a, b) => (b.issued_at ?? '').localeCompare(a.issued_at ?? '') || b.number.localeCompare(a.number));
}

export async function getQuotes(ownerId: string): Promise<Quote[]> {
  const rows = await table<Quote>('quotes').all();
  return rows
    .filter((q) => !q.owner_id || q.owner_id === ownerId)
    .sort((a, b) => (b.issued_at ?? '').localeCompare(a.issued_at ?? '') || b.number.localeCompare(a.number));
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  return table<Invoice>('invoices').find(id);
}

/** Every payment recorded against this invoice so far, oldest first. */
export async function getInvoicePayments(ownerId: string, invoiceId: string): Promise<FinanceEntry[]> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_payment' && e.linked_invoice_id === invoiceId
  );
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** invoice id → total actually paid on it so far — a partially-paid invoice
 *  has real money in it that a plain `status === 'paid'` check would miss. */
export async function getInvoicePaidTotals(ownerId: string): Promise<Map<string, number>> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_payment' && !!e.linked_invoice_id
  );
  const totals = new Map<string, number>();
  for (const r of rows) {
    const id = r.linked_invoice_id as string;
    totals.set(id, Math.round(((totals.get(id) ?? 0) + r.amount) * 100) / 100);
  }
  return totals;
}

export async function getQuoteById(id: string): Promise<Quote | undefined> {
  return table<Quote>('quotes').find(id);
}

/**
 * Income split by stream — the number that actually answers "is the
 * teaching side pulling its weight against the freelance side?", which a
 * single earnings total never could.
 */
export async function getIncomeByStream(ownerId: string): Promise<
  { stream: IncomeStream; invoiced: number; paid: number; outstanding: number }[]
> {
  const invoices = await getInvoices(ownerId);
  const paidTotals = await getInvoicePaidTotals(ownerId);
  const streams = new Map<IncomeStream, { invoiced: number; paid: number }>();

  for (const inv of invoices) {
    const key = inv.stream ?? 'other';
    const acc = streams.get(key) ?? { invoiced: 0, paid: 0 };
    const total = grandTotal(inv);
    if (inv.status !== 'draft') acc.invoiced += total;
    if (inv.status === 'paid' || inv.status === 'partial') acc.paid += Math.min(total, paidTotals.get(inv.id) ?? 0);
    streams.set(key, acc);
  }

  return Array.from(streams.entries())
    .map(([stream, v]) => ({ stream, ...v, outstanding: Math.round((v.invoiced - v.paid) * 100) / 100 }))
    .sort((a, b) => b.invoiced - a.invoiced);
}

export async function getBillingForClient(clientId: string, projectIds: string[]) {
  const [invoices, quotes] = await Promise.all([
    table<Invoice>('invoices').all(),
    table<Quote>('quotes').all(),
  ]);
  const mine = (d: { client_id: string | null; project_id: string | null }) =>
    d.client_id === clientId || (d.project_id ? projectIds.includes(d.project_id) : false);

  return { invoices: invoices.filter(mine), quotes: quotes.filter(mine) };
}
