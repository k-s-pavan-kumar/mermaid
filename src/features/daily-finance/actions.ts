'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { FinanceEntry } from './types';
import { EXPENSE_CATEGORIES } from './types';
import { insertIncomeEntry, insertRewardVaultExpense } from './queries';
import { newId } from '@/lib/id';

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
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return;

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

export async function deleteFinanceEntry(id: string): Promise<void> {
  const owner = await requireOwner();
  const row = await table<FinanceEntry>('finance_entries').find(id);
  // Manual expenses and reward_vault-sourced expenses can be deleted
  // directly by the user (a mis-recorded purchase price is a normal
  // correction). Anything else — invoice/bounty income — must be corrected
  // at its source so the ledger never drifts from the record it mirrors.
  if (!row || row.owner_id !== owner) return;
  if (row.source !== 'manual' && row.source !== 'reward_vault') return;
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
