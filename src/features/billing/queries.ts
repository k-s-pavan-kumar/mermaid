import { table } from '@/lib/data';
import { grandTotal, type Invoice, type Quote, type IncomeStream } from './types';

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
  const streams = new Map<IncomeStream, { invoiced: number; paid: number }>();

  for (const inv of invoices) {
    const key = inv.stream ?? 'other';
    const acc = streams.get(key) ?? { invoiced: 0, paid: 0 };
    const total = grandTotal(inv);
    if (inv.status !== 'draft') acc.invoiced += total;
    if (inv.status === 'paid') acc.paid += total;
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
