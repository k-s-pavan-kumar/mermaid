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
  | 'reward_vault'     // a Need marked purchased, if that setting is on
  | 'salary'           // a hand-typed pay-day entry — the one other deliberate manual income path (see logSalary)
  | 'obligation';      // a Due (see FinanceObligation) marked settled — either direction

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
  linked_obligation_id?: string | null;
  /** Tax deducted at source, on income rows only — a client's TDS deduction
   *  on an invoice, or the TDS a salary already had withheld. `amount`
   *  above is always the net amount actually received; this is kept
   *  alongside it purely so it's visible somewhere (for tax-filing/credit
   *  purposes) instead of disappearing into the gap between what was
   *  invoiced/earned and what showed up in the bank. Never set on expenses. */
  tds_amount?: number | null;
}

export const EXPENSE_CATEGORIES = [
  'Rent', 'Food', 'Subscriptions', 'Shopping', 'Travel', 'Tools / software', 'Wishlist purchase',
  'Education', 'Loan / debt', 'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** The one category a `salary` entry always uses — a fixed label rather
 *  than a chosen one, same spirit as income categories elsewhere. */
export const SALARY_CATEGORY = 'Salary';

// ---------------------------------------------------------------------------
// Custom categories & label-matching rules
//
// Two small, per-owner tables sit alongside the fixed EXPENSE_CATEGORIES
// list above:
//   - finance_categories: extra categories the person has typed in, kept so
//     they show up in the picker next time instead of being retyped.
//   - finance_category_rules: "if the item's label contains X, file it
//     under category Y" — e.g. "bike" → "Travel". Checked whenever a label
//     is typed, so a specific purchase (a bike oil change) rolls up to the
//     broader category (Travel) without the person choosing it by hand
//     every time.
// Both are plain, user-editable data — never inferred automatically beyond
// the explicit rules the person has added.
// ---------------------------------------------------------------------------

export interface FinanceCategory {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface FinanceCategoryRule {
  id: string;
  owner_id: string;
  /** Matched as a case-insensitive substring of the typed label. */
  keyword: string;
  category: string;
  created_at: string;
}

/** First rule whose keyword appears in `label`, if any. Longest keyword
 *  wins when more than one matches, so a more specific rule (e.g. "bike
 *  oil") beats a broader one (e.g. "bike") when both are present. */
export function matchCategoryForLabel(label: string, rules: FinanceCategoryRule[]): string | null {
  const lower = label.trim().toLowerCase();
  if (!lower) return null;
  const hits = rules.filter((r) => r.keyword && lower.includes(r.keyword.toLowerCase()));
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.keyword.length - a.keyword.length);
  return hits[0]!.category;
}

// ---------------------------------------------------------------------------
// Dues — recurring or one-off amounts owed either way: college fee, a loan
// being cleared, paying a friend back, or a friend/client owing money back
// to the person. Kept as their own small table of "things to watch for",
// separate from the ledger itself, so they can be seen at a glance ("what's
// still pending this month") instead of being searched for in past months'
// expense lists.
// ---------------------------------------------------------------------------

/** payable: money the person owes and will pay out (a bill, a loan, a debt
 *  to a friend). receivable: money owed TO the person (a friend paying back
 *  a loan, a client refund). Settling either posts a real FinanceEntry —
 *  an expense for payable, an income for receivable — exactly like every
 *  other income path in this app, just triggered by the person confirming
 *  the due was settled rather than typed in freely. */
export type ObligationDirection = 'payable' | 'receivable';
export type ObligationCadence = 'monthly' | 'one_time';

export interface FinanceObligation {
  id: string;
  owner_id: string;
  label: string; // "College fee", "Ramesh — loan clearance"
  category: string;
  direction: ObligationDirection;
  cadence: ObligationCadence;
  /** Prefilled amount at settle-time; still editable per instance since
   *  bills like this often vary month to month. */
  default_amount: number | null;
  /** 'YYYY-MM-DD'. For a one-time due, the date it's owed by. For a monthly
   *  due, only the day-of-month matters — it's projected onto every month. */
  due_date: string | null;
  note: string | null;
  /** Soft on/off switch. Dues are no longer archived when cleared — a
   *  cleared due stays in the tracker (balance 0, status Cleared) so the
   *  payment history stays visible until it's removed by hand. */
  active: boolean;
  created_at: string;
}

export type DueStatus = 'pending' | 'partial' | 'cleared';

/** One row of the Dues tracker: what has to be paid this period, every
 *  payment made against it so far, and what's left. */
export interface ObligationView {
  obligation: FinanceObligation;
  /** Payments made against this period (this month for `monthly`, ever for
   *  `one_time`), oldest first. Each one is a real ledger entry. */
  payments: FinanceEntry[];
  /** Amount to pay this period. Null only for older dues created before an
   *  amount was required. */
  need: number | null;
  /** This period's due date ('YYYY-MM-DD'), or null if none was set. */
  dueDate: string | null;
  paid: number;
  /** need − paid, never below 0. Null when `need` is unknown. */
  balance: number | null;
  status: DueStatus;
  /** Past its due date and not yet cleared. */
  overdue: boolean;
}

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
