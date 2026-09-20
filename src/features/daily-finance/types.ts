import type { ProjectType } from '@/features/projects/types';

/**
 * The day-to-day cash ledger. Separate from Meridian's invoicing (which
 * tracks what's owed and by whom) — this is "where did the money actually
 * go", grouped by day and rolled up into month/year totals.
 *
 * Core rule, enforced structurally rather than by convention: income is
 * NEVER typed in. The only way a `type: income` row comes to exist is as
 * the side effect of a real event elsewhere in Meridian — an invoice being
 * marked paid, a bounty reaching `paid`, or (going the other way) a Reward
 * Vault need being marked purchased posting an expense. There is no create
 * action here that takes an arbitrary `type`; `logExpense()` only ever
 * writes `type: 'expense'`, and every `type: 'income'` row is written by
 * `postIncomeEntry()` from another feature's own action, never from a form.
 */
export type FinanceEntryType = 'income' | 'expense';

export type FinanceEntrySource =
  | 'manual'          // a hand-typed expense
  | 'invoice_payment'  // an invoice marked paid (this app's equivalent of the skill's "ProjectPayment")
  | 'bounty_payout'    // a BountyCase reaching status: paid
  | 'reward_vault';     // a Need marked purchased, if that setting is on

export interface FinanceEntry {
  id: string;
  owner_id: string;
  date: string; // 'YYYY-MM-DD'
  type: FinanceEntryType;
  /** For expenses: a user-editable category. For income: always derived
   *  from the source project's type (see categoryForProjectType) or a fixed
   *  label ("Bug bounty") — never chosen freely. */
  category: string;
  /** Always stored positive — sign and color come from `type` at render
   *  time, never from the stored value. */
  amount: number;
  note: string | null;
  source: FinanceEntrySource;
  created_at: string;
  // Set only when the matching `source` produced this row — see above.
  linked_project_id?: string | null;
  linked_invoice_id?: string | null;
  linked_bounty_id?: string | null;
  linked_need_id?: string | null;
}

export const EXPENSE_CATEGORIES = [
  'Rent', 'Food', 'Subscriptions', 'Shopping', 'Travel', 'Tools / software', 'Wishlist purchase', 'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Income category label, derived purely from the paying project's type.
 * This is the app's mapping of the skill's `client|freelance|institute|
 * internal|other` onto the richer `ProjectType` this app already has —
 * every type gets a sensible label rather than requiring a fifth "other"
 * bucket for everything that isn't clearly one of the four.
 */
export function categoryForProjectType(type: ProjectType): string {
  switch (type) {
    case 'client': return 'Client payment';
    case 'freelance': return 'Freelance royalty';
    case 'institute': return 'Institute payment';
    case 'internal': return 'Internal payment';
    case 'opensource': return 'Open source royalty';
    default: return 'Project payment';
  }
}

export interface DayGroup {
  date: string;
  entries: FinanceEntry[];
  net: number; // signed
}

export interface MonthTotals {
  income: number;
  expense: number;
  net: number;
}
