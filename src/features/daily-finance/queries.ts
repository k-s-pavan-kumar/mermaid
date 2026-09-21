import { table } from '@/lib/data';
import { shiftIso } from '@/lib/tz/today';
import type { FinanceEntry, DayGroup, MonthTotals } from './types';
import { newId } from '@/lib/id';

async function entriesFor(ownerId: string, from: string, to: string): Promise<FinanceEntry[]> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.date >= from && e.date <= to
  );
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function signed(e: FinanceEntry): number {
  return e.type === 'income' ? e.amount : -e.amount;
}

export function monthEndOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Every entry for one month, grouped by day, newest day first — the shape
 *  the ledger panel renders directly. */
export async function getMonthLedger(ownerId: string, monthStart: string): Promise<{
  days: DayGroup[];
  totals: MonthTotals;
}> {
  const entries = await entriesFor(ownerId, monthStart, monthEndOf(monthStart));
  const byDate = new Map<string, FinanceEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const days: DayGroup[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, es]) => ({ date, entries: es, net: es.reduce((n, e) => n + signed(e), 0) }));

  const income = entries.filter((e) => e.type === 'income').reduce((n, e) => n + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0);

  return { days, totals: { income, expense, net: income - expense } };
}

/** Expense-only category breakdown for a month, sorted descending. Income
 *  never appears here — this chart is about spending, not cash flow. */
export async function getCategoryBreakdown(ownerId: string, monthStart: string): Promise<{ category: string; amount: number }[]> {
  const entries = await entriesFor(ownerId, monthStart, monthEndOf(monthStart));
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== 'expense') continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** One point per day that has at least one entry, for the daily-net chart. */
export async function getDailyNet(ownerId: string, monthStart: string): Promise<{ date: string; net: number }[]> {
  const { days } = await getMonthLedger(ownerId, monthStart);
  return days.map((d) => ({ date: d.date, net: d.net })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface MonthRow { month: string; label: string; income: number; expense: number; net: number }

/** Year totals plus a 12-row month-by-month breakdown. */
export async function getYearFinance(ownerId: string, year: number): Promise<{
  totals: MonthTotals;
  months: MonthRow[];
}> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const entries = await entriesFor(ownerId, from, to);

  const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const monthEntries = entries.filter((e) => e.date.startsWith(m));
    const income = monthEntries.filter((e) => e.type === 'income').reduce((n, e) => n + e.amount, 0);
    const expense = monthEntries.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0);
    return {
      month: m,
      label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      income, expense, net: income - expense,
    };
  });

  const income = entries.filter((e) => e.type === 'income').reduce((n, e) => n + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0);

  return { totals: { income, expense, net: income - expense }, months };
}

/** Lightweight month figures, used by the Dashboard's compact summary card
 *  so it doesn't need to pull the full ledger just to show two numbers. */
export async function getMonthTotals(ownerId: string, monthStart: string): Promise<MonthTotals> {
  const entries = await entriesFor(ownerId, monthStart, monthEndOf(monthStart));
  const income = entries.filter((e) => e.type === 'income').reduce((n, e) => n + e.amount, 0);
  const expense = entries.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0);
  return { income, expense, net: income - expense };
}

export { shiftIso };

// ---------------------------------------------------------------------------
// Posting — the pure DB-mutation half of postIncomeEntry/postRewardVaultExpense.
// Split out from actions.ts so this logic (in particular, the idempotency
// check) can be exercised directly — including by the verify suite — without
// going through revalidatePath(), which, like cookies(), only works inside a
// real Next.js request.
// ---------------------------------------------------------------------------

function newEntryId(): string {
  return newId();
}

/**
 * Idempotent per `(source, linkedId)` pair: if the entry already exists
 * (e.g. a double-click, or a retry), it's left alone rather than duplicated.
 */
export async function insertIncomeEntry(input: {
  ownerId: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
  source: Extract<FinanceEntry['source'], 'invoice_payment' | 'bounty_payout'>;
  linkedProjectId?: string | null;
  linkedInvoiceId?: string | null;
  linkedBountyId?: string | null;
}): Promise<void> {
  const existing = await table<FinanceEntry>('finance_entries').where(
    (e) =>
      e.owner_id === input.ownerId &&
      e.source === input.source &&
      (input.source === 'invoice_payment' ? e.linked_invoice_id === input.linkedInvoiceId : e.linked_bounty_id === input.linkedBountyId)
  );
  if (existing.length > 0) return;

  await table<FinanceEntry>('finance_entries').insert({
    id: newEntryId(),
    owner_id: input.ownerId,
    date: input.date,
    type: 'income',
    category: input.category,
    amount: Math.max(0, input.amount),
    note: input.note,
    source: input.source,
    created_at: new Date().toISOString(),
    linked_project_id: input.linkedProjectId ?? null,
    linked_invoice_id: input.linkedInvoiceId ?? null,
    linked_bounty_id: input.linkedBountyId ?? null,
  });
}

export async function insertRewardVaultExpense(input: {
  ownerId: string;
  date: string;
  amount: number;
  note: string;
  linkedNeedId: string;
}): Promise<void> {
  const existing = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === input.ownerId && e.source === 'reward_vault' && e.linked_need_id === input.linkedNeedId
  );
  if (existing.length > 0) return;

  await table<FinanceEntry>('finance_entries').insert({
    id: newEntryId(),
    owner_id: input.ownerId,
    date: input.date,
    type: 'expense',
    category: 'Wishlist purchase',
    amount: Math.max(0, input.amount),
    note: input.note,
    source: 'reward_vault',
    created_at: new Date().toISOString(),
    linked_need_id: input.linkedNeedId,
  });
}
