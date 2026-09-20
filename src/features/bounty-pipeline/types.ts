/**
 * A standalone kanban tracker for bug bounty work — deliberately not shaped
 * like a `Project`. A bounty has no client, no invoice, and no ongoing
 * relationship the way a project does, so forcing it into that shape would
 * mean a lot of nullable, irrelevant project fields just to satisfy the
 * Daily Finance income rule. `BountyCase` is its own top-level, owner-scoped
 * entity that happens to also know how to produce a FinanceEntry once paid.
 *
 * This is separate from the older, project-nested `BountySubmission` type
 * still used on a bounty-type project's own "Submissions" tab — that one
 * stays as a lightweight disclosure log tied to a project; this one is the
 * full pipeline with its own payout lifecycle, reachable from its own page.
 */
export type BountySeverity = 'critical' | 'high' | 'medium' | 'low';
export type BountyStatus = 'submitted' | 'triaged' | 'accepted' | 'paid' | 'rejected' | 'duplicate';

export interface BountyCase {
  id: string;
  owner_id: string;
  title: string;
  program_name: string;
  severity: BountySeverity;
  status: BountyStatus;
  currency: string;

  /** The user's own guess — authoritative only while submitted/triaged. */
  estimated_payout: number | null;
  /** Set once the program responds with a number — authoritative at accepted. */
  confirmed_payout: number | null;
  /** Set once actually paid — authoritative at paid. Normally equals
   *  confirmed_payout but kept separate in case the program pays a
   *  different final amount. */
  paid_amount: number | null;

  submitted_at: string;
  triaged_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;

  created_at: string;
}

/** Which payout figure is the one to show, given where the card sits — see
 *  the skill: never blend these into one generic "amount". */
export function activePayout(c: BountyCase): { amount: number | null; kind: 'estimate' | 'confirmed' | 'paid' | null } {
  if (c.status === 'paid') return { amount: c.paid_amount, kind: 'paid' };
  if (c.status === 'accepted') return { amount: c.confirmed_payout, kind: 'confirmed' };
  return { amount: c.estimated_payout, kind: 'estimate' };
}

export const SEVERITY_ORDER: BountySeverity[] = ['critical', 'high', 'medium', 'low'];
