'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { FinanceEntry, FinanceCategory, FinanceCategoryRule, FinanceObligation } from './types';
import { EXPENSE_CATEGORIES, SALARY_CATEGORY } from './types';
import { insertIncomeEntry, insertRewardVaultExpense } from './queries';
import { newId } from '@/lib/id';
import { todayIso } from '@/lib/tz/today';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/**
 * The only way a person directly creates a FinanceEntry. Always an expense
 * — there is deliberately no `type` field on this form and no income
 * counterpart anywhere in this file that a form could call.
 */
export async function logExpense(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const date = String(formData.get('date') ?? '').trim();
  const amount = Number(formData.get('amount') ?? 0);
  const category = String(formData.get('category') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!date || !Number.isFinite(amount) || amount <= 0 || !category) return;

  // The category no longer has to be one of the fixed defaults: any label
  // the person types is accepted, and — if it isn't already a default or a
  // category they've used before — quietly saved as a custom category so
  // it shows up in the picker next time instead of having to be retyped.
  const isDefault = (EXPENSE_CATEGORIES as readonly string[]).includes(category);
  if (!isDefault) {
    const existing = await table<FinanceCategory>('finance_categories').where(
      (c) => c.owner_id === owner && c.name.toLowerCase() === category.toLowerCase()
    );
    if (existing.length === 0) {
      await table<FinanceCategory>('finance_categories').insert({
        id: newId(),
        owner_id: owner,
        name: category,
        created_at: new Date().toISOString(),
      });
    }
  }

  await table<FinanceEntry>('finance_entries').insert({
    id: newId(),
    owner_id: owner,
    date,
    type: 'expense',
    category,
    amount,
    note: note || null,
    source: 'manual',
    created_at: new Date().toISOString(),
  });

  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/**
 * Adds (or, matched case-insensitively, no-ops on) a keyword → category
 * matching rule — "bike" always rolls up under "Travel", say. Checked
 * client-side against whatever label the person types while logging an
 * expense, so a specific item (a bike oil change) files itself under the
 * broader category without being chosen by hand each time.
 */
export async function addCategoryRule(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const keyword = String(formData.get('keyword') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  if (!keyword || !category) return;

  const existing = await table<FinanceCategoryRule>('finance_category_rules').where(
    (r) => r.owner_id === owner && r.keyword.toLowerCase() === keyword.toLowerCase()
  );
  if (existing.length > 0) {
    await table<FinanceCategoryRule>('finance_category_rules').update(existing[0]!.id, { category });
  } else {
    await table<FinanceCategoryRule>('finance_category_rules').insert({
      id: newId(),
      owner_id: owner,
      keyword,
      category,
      created_at: new Date().toISOString(),
    });
  }
  revalidatePath('/daily-finance');
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const owner = await requireOwner();
  const row = await table<FinanceCategoryRule>('finance_category_rules').find(id);
  if (!row || row.owner_id !== owner) return;
  await table<FinanceCategoryRule>('finance_category_rules').remove(id);
  revalidatePath('/daily-finance');
}

/**
 * The other deliberate, explicit manual-income path alongside the reward
 * vault's auto-post — a pay day has no other event in Meridian to hang off
 * of, so this is its own small form rather than a back door on logExpense.
 * `tds` is what the employer already withheld; `amount` is always the net
 * figure that actually landed, matching the invariant kept everywhere else
 * (see FinanceEntry.amount).
 */
export async function logSalary(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const date = String(formData.get('date') ?? '').trim();
  const amount = Number(formData.get('amount') ?? 0);
  const tds = Number(formData.get('tds') ?? 0);
  const note = String(formData.get('note') ?? '').trim();

  if (!date || !Number.isFinite(amount) || amount <= 0) return;
  const tdsAmount = Number.isFinite(tds) && tds > 0 ? tds : null;

  await table<FinanceEntry>('finance_entries').insert({
    id: newId(),
    owner_id: owner,
    date,
    type: 'income',
    category: SALARY_CATEGORY,
    amount,
    note: note || null,
    source: 'salary',
    created_at: new Date().toISOString(),
    tds_amount: tdsAmount,
  });

  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

// ---------------------------------------------------------------------------
// Dues (obligations) — college fee, loan clearance, paying/being paid back
// by a friend, and anything else that's easier to watch for than to search
// past months' expenses for.
// ---------------------------------------------------------------------------

export async function createObligation(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const direction = String(formData.get('direction') ?? 'payable').trim();
  const cadence = String(formData.get('cadence') ?? 'monthly').trim();
  const defaultAmountRaw = String(formData.get('default_amount') ?? '').trim();
  const dueDateRaw = String(formData.get('due_date') ?? '').trim();
  const takenDateRaw = String(formData.get('taken_date') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!label || !category) return;
  if (direction !== 'payable' && direction !== 'receivable') return;
  if (cadence !== 'monthly' && cadence !== 'one_time') return;

  const defaultAmount = defaultAmountRaw ? Number(defaultAmountRaw) : null;

  // A custom category typed here is saved for reuse too, same as logExpense.
  const isDefault = (EXPENSE_CATEGORIES as readonly string[]).includes(category);
  if (!isDefault) {
    const existing = await table<FinanceCategory>('finance_categories').where(
      (c) => c.owner_id === owner && c.name.toLowerCase() === category.toLowerCase()
    );
    if (existing.length === 0) {
      await table<FinanceCategory>('finance_categories').insert({
        id: newId(), owner_id: owner, name: category, created_at: new Date().toISOString(),
      });
    }
  }

  await table<FinanceObligation>('finance_obligations').insert({
    id: newId(),
    owner_id: owner,
    label,
    category,
    direction: direction as FinanceObligation['direction'],
    cadence: cadence as FinanceObligation['cadence'],
    default_amount: defaultAmount && Number.isFinite(defaultAmount) && defaultAmount > 0 ? defaultAmount : null,
    due_date: cadence === 'monthly' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : null,
    taken_date: /^\d{4}-\d{2}-\d{2}$/.test(takenDateRaw) ? takenDateRaw : null,
    note: note || null,
    active: true,
    created_at: new Date().toISOString(),
  });

  revalidatePath('/daily-finance');
}

export async function deleteObligation(id: string): Promise<void> {
  const owner = await requireOwner();
  const row = await table<FinanceObligation>('finance_obligations').find(id);
  if (!row || row.owner_id !== owner) return;
  await table<FinanceObligation>('finance_obligations').remove(id);
  revalidatePath('/daily-finance');
}

/**
 * Records one payment against a due: posts a real FinanceEntry (expense for
 * a payable due, income for a receivable one — a friend paying back a loan
 * is real money in, same as any other income path here) and links it back
 * to the obligation. A due can take several payments; its balance and
 * status (pending / partial / cleared) are recomputed from them on read.
 * Monthly dues start over each month, since only that month's payments count.
 */
export async function settleObligation(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const obligationId = String(formData.get('obligation_id') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim() || todayIso();
  const amount = Number(formData.get('amount') ?? 0);
  const note = String(formData.get('note') ?? '').trim();

  if (!obligationId || !Number.isFinite(amount) || amount <= 0) return;

  const obligation = await table<FinanceObligation>('finance_obligations').find(obligationId);
  if (!obligation || obligation.owner_id !== owner) return;

  await table<FinanceEntry>('finance_entries').insert({
    id: newId(),
    owner_id: owner,
    date,
    type: obligation.direction === 'payable' ? 'expense' : 'income',
    category: obligation.category,
    amount,
    note: note || obligation.label,
    source: 'obligation',
    created_at: new Date().toISOString(),
    linked_obligation_id: obligation.id,
  });

  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

export async function deleteFinanceEntry(id: string): Promise<void> {
  const owner = await requireOwner();
  const row = await table<FinanceEntry>('finance_entries').find(id);
  // Manual expenses, reward_vault-sourced expenses, salary entries, and
  // obligation settlements can all be deleted directly by the user (a
  // mis-recorded figure is a normal correction, and re-settling a due after
  // deleting a mistaken entry is exactly the intended flow). Anything else
  // — invoice/bounty income — must be corrected at its source so the ledger
  // never drifts from the record it mirrors.
  if (!row || row.owner_id !== owner) return;
  if (!['manual', 'reward_vault', 'salary', 'obligation'].includes(row.source)) return;
  await table<FinanceEntry>('finance_entries').remove(id);
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/**
 * Called by other features' own actions — never by a form directly — the
 * instant a real income event happens (an invoice marked paid, a bounty
 * reaching `paid`). Idempotent per `(source, linkedId)` pair: if the entry
 * already exists (e.g. a double-click, or a retry), it's left alone rather
 * than duplicated.
 */
export async function postIncomeEntry(input: {
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
}): Promise<void> {
  await insertIncomeEntry(input);
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/**
 * The one non-manual expense path — called by the Reward Vault's "Mark
 * purchased" action when the auto-post setting is on. Still editable/
 * deletable by the user afterward (see deleteFinanceEntry above).
 */
export async function postRewardVaultExpense(input: {
  ownerId: string;
  date: string;
  amount: number;
  note: string;
  linkedNeedId: string;
}): Promise<void> {
  await insertRewardVaultExpense(input);
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}
