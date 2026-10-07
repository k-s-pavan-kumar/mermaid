import { table } from '@/lib/data';
import { shiftIso, todayIso } from '@/lib/tz/today';
import type {
  FinanceEntry, DayGroup, MonthTotals,
  FinanceCategory, FinanceCategoryRule, FinanceObligation, ObligationView,
} from './types';
import { newId } from '@/lib/id';
import {
  assignCategories, buildStreamsOverview, knownIncomeCategories, STREAM_COLORS,
  type IncomeStream, type StreamsOverview,
} from './streams';
import { SALARY_CATEGORY, categoryForProjectType } from './types';
import { applySplitsForPayment } from './set-aside';


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
  tdsAmount?: number | null;
  /** Shown in the note of any set-aside this payment triggers. */
  invoiceNumber?: string | null;
}): Promise<void> {
  const existing = await table<FinanceEntry>('finance_entries').where(
    (e) =>
      e.owner_id === input.ownerId &&
      e.source === input.source &&
      (input.source === 'invoice_payment' ? e.linked_invoice_id === input.linkedInvoiceId : e.linked_bounty_id === input.linkedBountyId)
  );
  if (existing.length > 0) return;

  const inserted = await table<FinanceEntry>('finance_entries').insert({
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
    tds_amount: input.tdsAmount ?? null,
  });

  // Invoice money (e.g. a monthly retainer) triggers the same set-asides as
  // a payment recorded from the invoice page. Bounties are not invoices.
  if (input.source === 'invoice_payment') await applySplitsForPayment(input.ownerId, inserted, input.invoiceNumber ?? null);
}

// ---------------------------------------------------------------------------
// Custom categories & matching rules
// ---------------------------------------------------------------------------

export async function getCustomCategories(ownerId: string): Promise<string[]> {
  const rows = await table<FinanceCategory>('finance_categories').where((c) => c.owner_id === ownerId);
  return rows.map((c) => c.name).sort((a, b) => a.localeCompare(b));
}

export async function getCategoryRules(ownerId: string): Promise<FinanceCategoryRule[]> {
  const rows = await table<FinanceCategoryRule>('finance_category_rules').where((r) => r.owner_id === ownerId);
  return [...rows].sort((a, b) => a.keyword.localeCompare(b.keyword));
}

// ---------------------------------------------------------------------------
// Dues (obligations)
// ---------------------------------------------------------------------------

/** The due date for the period being viewed. Only monthly dues have one: it
 *  reuses the due's day-of-month (clamped, so a due on the 31st lands on the
 *  30th/28th in shorter months). One-time dues have no date. */
function periodDueDate(o: FinanceObligation, monthStart: string): string | null {
  if (o.cadence !== 'monthly' || !o.due_date) return null;
  const day = Number(o.due_date.slice(8, 10));
  const lastDay = Number(monthEndOf(monthStart).slice(8, 10));
  return `${monthStart.slice(0, 7)}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, '0')}`;
}

/** Turns a due plus its payments into one tracker row: need, paid,
 *  balance, status. Pure, so it can be checked without a database. */
export function buildObligationView(
  obligation: FinanceObligation,
  payments: FinanceEntry[],
  monthStart: string,
  today: string
): ObligationView {
  const sorted = [...payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const paid = sorted.reduce((n, e) => n + e.amount, 0);
  const need = obligation.default_amount && obligation.default_amount > 0 ? obligation.default_amount : null;
  const dueDate = periodDueDate(obligation, monthStart);

  // Older dues have no amount, so any payment at all counts as settling them
  // (the behaviour before partial payments existed).
  const balance = need === null ? null : Math.max(0, need - paid);
  const status: ObligationView['status'] =
    need === null ? (paid > 0 ? 'cleared' : 'pending')
    : balance === 0 ? 'cleared'
    : paid > 0 ? 'partial'
    : 'pending';
  const overdue = status !== 'cleared' && !!dueDate && dueDate < today;

  return { obligation, payments: sorted, need, dueDate, takenDate: obligation.taken_date ?? null, paid, balance, status, overdue };
}

/** Active dues, each with this period's payments, balance and status.
 *  Anything not yet cleared comes first (overdue at the very top). */
export async function getObligationsOverview(ownerId: string, monthStart: string): Promise<ObligationView[]> {
  // A monthly due doesn't exist in months before it was created — browsing
  // back to an earlier month shouldn't show it as pending or overdue there.
  const obligations = await table<FinanceObligation>('finance_obligations').where(
    (o) => o.owner_id === ownerId && o.active &&
      (o.cadence === 'one_time' || o.created_at.slice(0, 7) <= monthStart.slice(0, 7))
  );
  if (obligations.length === 0) return [];

  const monthEnd = monthEndOf(monthStart);
  const today = todayIso();
  const ids = new Set(obligations.map((o) => o.id));
  const linkedEntries = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'obligation' && !!e.linked_obligation_id && ids.has(e.linked_obligation_id)
  );

  const views = obligations.map((obligation) => {
    const forThis = linkedEntries.filter((e) => e.linked_obligation_id === obligation.id);
    const inPeriod = obligation.cadence === 'monthly'
      ? forThis.filter((e) => e.date >= monthStart && e.date <= monthEnd)
      : forThis;
    return buildObligationView(obligation, inPeriod, monthStart, today);
  });

  const rank = (v: ObligationView) => (v.status === 'cleared' ? 2 : v.overdue ? 0 : 1);
  return views.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ad = a.dueDate ?? '9999-12-31';
    const bd = b.dueDate ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.obligation.label.localeCompare(b.obligation.label);
  });
}

/** Total TDS deducted across every income entry in a calendar year — the
 *  figure someone needs when claiming credit for tax already withheld. */
export async function getTdsSummary(ownerId: string, year: number): Promise<number> {
  const entries = await entriesFor(ownerId, `${year}-01-01`, `${year}-12-31`);
  return entries.reduce((n, e) => n + (e.tds_amount ?? 0), 0);
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

// ---------------------------------------------------------------------------
// Income streams (yearly targets) — see streams.ts for the rules.
// ---------------------------------------------------------------------------

const FIXED_INCOME_CATEGORIES = [
  SALARY_CATEGORY, 'Bug bounty',
  ...(['client', 'freelance', 'institute', 'teaching', 'marketing', 'internal', 'opensource'] as const).map(categoryForProjectType),
];

export async function getIncomeStreams(ownerId: string): Promise<IncomeStream[]> {
  const rows = await table<IncomeStream>('income_streams').where((s) => s.owner_id === ownerId);
  return rows.map((s) => ({ ...s, categories: s.categories ?? [], targets: s.targets ?? {} }))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export async function getStreamsOverview(ownerId: string, year: number, today: string): Promise<{
  overview: StreamsOverview;
  incomeCategories: string[];
}> {
  const [entries, streams] = await Promise.all([entriesFor(ownerId, `${year}-01-01`, `${year}-12-31`), getIncomeStreams(ownerId)]);
  // Offer every income category ever posted, not just this year's, so a stream can be set up before the first payment lands.
  const all = await table<FinanceEntry>('finance_entries').where((e) => e.owner_id === ownerId && e.type === 'income');
  return {
    overview: buildStreamsOverview(entries, streams, year, today),
    incomeCategories: knownIncomeCategories(all, FIXED_INCOME_CATEGORIES),
  };
}

/** Create or update one stream. A category can live in only one stream, so
 *  any category claimed here is released from the others. Pure DB work (no
 *  revalidatePath) so the verify suite can call it directly. */
export async function saveIncomeStream(input: {
  ownerId: string; id?: string | null; name: string; color?: string | null;
  categories: string[]; year: number; target: number | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return { ok: false, error: 'Give the stream a name' };
  if (input.target !== null && (!Number.isFinite(input.target) || input.target < 0)) return { ok: false, error: 'Target must be a positive number' };

  const streams = await getIncomeStreams(input.ownerId);
  if (streams.some((s) => s.id !== input.id && s.name.toLowerCase() === name.toLowerCase()))
    return { ok: false, error: `You already have a stream called “${name}”` };

  const key = String(input.year);
  let id = input.id ?? '';
  const existing = streams.find((s) => s.id === id);
  if (id && !existing) return { ok: false, error: 'That stream no longer exists' };

  if (existing) {
    const targets = { ...existing.targets };
    if (input.target && input.target > 0) targets[key] = input.target; else delete targets[key];
    await table<IncomeStream>('income_streams').update(id, { name, color: input.color || existing.color, targets });
  } else {
    id = newId();
    await table<IncomeStream>('income_streams').insert({
      id, owner_id: input.ownerId, name,
      color: input.color || STREAM_COLORS[streams.length % STREAM_COLORS.length]!,
      categories: [], targets: input.target && input.target > 0 ? { [key]: input.target } : {},
      sort_order: streams.length, created_at: new Date().toISOString(),
    });
  }

  const after = assignCategories([...(await getIncomeStreams(input.ownerId))], id, input.categories);
  for (const s of after) {
    const before = streams.find((x) => x.id === s.id);
    if (s.id === id || (before && before.categories.length !== s.categories.length))
      await table<IncomeStream>('income_streams').update(s.id, { categories: s.categories });
  }
  return { ok: true, id };
}

export async function removeIncomeStream(ownerId: string, id: string): Promise<boolean> {
  const s = await table<IncomeStream>('income_streams').find(id);
  if (!s || s.owner_id !== ownerId) return false;
  await table<IncomeStream>('income_streams').remove(id);
  return true;
}

/** One-click start: a stream per income category already in the ledger, so
 *  the pie chart works immediately. Skips categories a stream already owns. */
export async function seedStreamsFromCategories(ownerId: string, year: number): Promise<number> {
  const streams = await getIncomeStreams(ownerId);
  const taken = new Set(streams.flatMap((s) => s.categories.map((c) => c.toLowerCase())));
  const entries = await table<FinanceEntry>('finance_entries').where((e) => e.owner_id === ownerId && e.type === 'income');
  const cats = knownIncomeCategories(entries, []).filter((c) => !taken.has(c.toLowerCase()));
  let made = 0;
  for (const c of cats) {
    if (streams.some((s) => s.name.toLowerCase() === c.toLowerCase())) continue;
    const r = await saveIncomeStream({ ownerId, name: c, categories: [c], year, target: null });
    if (r.ok) made++;
  }
  return made;
}
