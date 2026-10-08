/**
 * Sister's share (a % of what was received on an invoice, added by hand per
 * invoice) and the investment log.
 *
 * The share is a ledger expense that is DERIVED from a real invoice — the
 * person decides, invoice by invoice, whether to give it (recurring invoices
 * never get one) — and it follows that invoice's received amount if a later
 * payment, a deleted payment or a TDS correction changes it.
 *
 * The investment log is the opposite, on purpose: a plain hand-kept list
 * (amount, invested in, date) that reads nothing from invoices or the ledger
 * and writes nothing to them.
 *
 * Pure DB work, no revalidatePath(): so this can be exercised by the verify
 * suite outside a Next.js request (see scripts/verify-set-aside.ts).
 */
import { table } from '@/lib/data';
import { newId } from '@/lib/id';
import type { FinanceEntry, InvestmentLogEntry } from './types';
import { SISTER_CATEGORY } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** `pct`% of `received`, to the paisa. */
export function splitShare(received: number, pct: number): number {
  return r2((Math.max(0, received) * pct) / 100);
}

/** Percent as shown in notes: 10 → "10", 7.5 → "7.5". */
export function fmtPct(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Sister's share — at most one per invoice
// ---------------------------------------------------------------------------

export async function getInvoiceShare(ownerId: string, invoiceId: string): Promise<FinanceEntry | undefined> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.linked_invoice_id === invoiceId
  );
  return rows[0];
}

/**
 * Gives (or, if one already exists, re-sets) the sister's share of one
 * invoice: `pct`% of `received`, the cash actually in hand for that invoice
 * so far (after TDS). Needs money to have been received — there is nothing to
 * take a share of before that.
 */
export async function setInvoiceShare(input: {
  ownerId: string; invoiceId: string; invoiceNumber: string; projectId?: string | null;
  pct: number; received: number; today: string;
}): Promise<SaveResult> {
  if (!Number.isFinite(input.pct) || input.pct <= 0 || input.pct > 100) return { ok: false, error: 'Percentage must be between 0 and 100.' };
  const amount = splitShare(input.received, input.pct);
  if (amount <= 0) return { ok: false, error: 'Record a payment on this invoice first — the share is taken from what you received.' };

  const existing = await getInvoiceShare(input.ownerId, input.invoiceId);
  const note = `${fmtPct(input.pct)}% of invoice ${input.invoiceNumber} → Sister`;
  if (existing) {
    await table<FinanceEntry>('finance_entries').update(existing.id, { amount, split_pct: input.pct, note });
    return { ok: true, id: existing.id };
  }
  const id = newId();
  await table<FinanceEntry>('finance_entries').insert({
    id,
    owner_id: input.ownerId,
    date: input.today,
    type: 'expense',
    category: SISTER_CATEGORY,
    amount,
    note,
    source: 'invoice_split',
    created_at: new Date().toISOString(),
    linked_project_id: input.projectId ?? null,
    linked_invoice_id: input.invoiceId,
    split_pct: input.pct,
  });
  return { ok: true, id };
}

/** Takes the share back off the ledger (the invoice itself is untouched). */
export async function removeInvoiceShare(ownerId: string, invoiceId: string): Promise<boolean> {
  const existing = await getInvoiceShare(ownerId, invoiceId);
  if (!existing) return false;
  await table<FinanceEntry>('finance_entries').remove(existing.id);
  return true;
}

/**
 * The invoice's received amount changed (another payment, a deleted one, a
 * TDS correction). If — and only if — the person already gave a share on this
 * invoice, keep it at the same % of the new figure. Never creates one.
 */
export async function resyncInvoiceShare(ownerId: string, invoiceId: string, received: number): Promise<void> {
  const existing = await getInvoiceShare(ownerId, invoiceId);
  if (!existing || existing.split_pct == null) return;
  const amount = splitShare(received, existing.split_pct);
  if (amount <= 0) await table<FinanceEntry>('finance_entries').remove(existing.id);
  else if (amount !== existing.amount) await table<FinanceEntry>('finance_entries').update(existing.id, { amount });
}

/** Total given to the sister between two dates (inclusive). */
export async function getSisterTotal(ownerId: string, from: string, to: string): Promise<number> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.date >= from && e.date <= to
  );
  return r2(rows.reduce((n, e) => n + e.amount, 0));
}

/** Every share given to the sister between two dates, newest first. */
export async function getSisterEntries(ownerId: string, from: string, to: string): Promise<FinanceEntry[]> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.date >= from && e.date <= to
  );
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at.localeCompare(a.created_at)));
}

/** Twelve month buckets (Jan..Dec) for one year: how much was given and how many shares. */
export async function getSisterMonthly(ownerId: string, year: number): Promise<{ month: string; amount: number; count: number }[]> {
  const rows = await getSisterEntries(ownerId, `${year}-01-01`, `${year}-12-31`);
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const inMonth = rows.filter((e) => e.date.slice(0, 7) === month);
    return { month, amount: r2(inMonth.reduce((n, e) => n + e.amount, 0)), count: inMonth.length };
  });
}

// ---------------------------------------------------------------------------
// Investment log — plain, hand-kept, standalone.
// ---------------------------------------------------------------------------

/** Oldest first, so a row's S.no never changes when a newer one is added. */
export async function getInvestmentLog(ownerId: string): Promise<InvestmentLogEntry[]> {
  const rows = await table<InvestmentLogEntry>('finance_investment_log').where((r) => r.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at.localeCompare(b.created_at)));
}

export async function addInvestmentLogEntry(input: {
  ownerId: string; amount: number; investedIn: string; date: string;
}): Promise<SaveResult> {
  const investedIn = input.investedIn.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!investedIn) return { ok: false, error: 'Say what you invested in.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'Enter the amount invested.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'Pick a date.' };
  const id = newId();
  await table<InvestmentLogEntry>('finance_investment_log').insert({
    id, owner_id: input.ownerId, amount: r2(input.amount), invested_in: investedIn, date: input.date,
    created_at: new Date().toISOString(),
  });
  return { ok: true, id };
}

export async function removeInvestmentLogEntry(ownerId: string, id: string): Promise<boolean> {
  const row = await table<InvestmentLogEntry>('finance_investment_log').find(id);
  if (!row || row.owner_id !== ownerId) return false;
  await table<InvestmentLogEntry>('finance_investment_log').remove(id);
  return true;
}
