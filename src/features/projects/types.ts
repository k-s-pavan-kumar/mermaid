import type { Quote, Invoice } from '@/features/billing/types';

export type { Quote, Invoice };

export type ProjectType =
  | 'client'
  | 'internal'
  | 'opensource'
  | 'mobile'
  | 'game'
  | 'web'
  | 'content'
  | 'assess'
  | 'bounty'
  | 'freelance'
  | 'institute'
  | 'teaching'
  | 'marketing';
/**
 * 'dropped' is additive, same as every other extension to this enum — an
 * explicit terminal state distinct from 'done', so the Reward Vault can tell
 * "finished, unlocks rewards" apart from "abandoned, releases rewards"
 * without overloading a single status value for two different meanings.
 */
export type ProjectStatus = 'idea' | 'ontrack' | 'review' | 'risk' | 'done' | 'dropped';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  /**
   * Primary type — always equal to types[0]. Kept as its own column so
   * existing single-type reads (list dots, Today badges, the `type` filter,
   * the Postgres index) keep working untouched.
   */
  type: ProjectType;
  /**
   * Full set of types. A project is rarely one thing — an open-source repo
   * can also be a web app, a client engagement can also be an assessment.
   * Order matters: the first entry is the primary type.
   */
  types: ProjectType[];
  client_id: string | null;
  status: ProjectStatus;
  description: string | null;
  /**
   * "Acme should get 15h/week" — a target scoped to this one project rather
   * than the workspace. Optional and additive: a project with no targets set
   * (the default `{}` from DEFAULT_PROJECT_TARGETS) simply doesn't appear in
   * the Dashboard's per-project section.
   */
  targets?: ProjectTargets;
  /**
   * The Reward Vault's unlock rule is `status == done AND an invoice is
   * paid` — real client/freelance/institute work always has that invoice.
   * A project with no real invoice (internal tools, plugins, YouTube) has no
   * natural "paid" signal to check, so this is the documented substitute:
   * an explicit, manually-set marker that stands in for "counts as earned"
   * for exactly this project. Setting it always writes a
   * ProjectStatusLogEntry with the required note — see
   * `markProjectEarnedOverride` in reward-vault/actions.ts — so the
   * substitute criterion is visible in the audit trail every time it's
   * used, not just once.
   */
  earned_override?: { amount: number; note: string; at: string } | null;
  created_at: string;
}

export interface ProjectTargets {
  weekly_focus_hours: number;
  monthly_focus_hours: number;
}

export const DEFAULT_PROJECT_TARGETS: ProjectTargets = {
  weekly_focus_hours: 0,
  monthly_focus_hours: 0,
};

export interface ProjectPhase {
  id: string;
  project_id: string;
  label: string;
  color: string;
  sort_order: number;
  width_pct: number;
}

export interface BountySubmission {
  id: string;
  project_id: string;
  program: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  status: 'submitted' | 'triaged' | 'accepted' | 'duplicate' | 'rejected';
  payout: number | null;
  currency: string;
  disclosure_deadline: string | null;
}

export interface ProjectMetric {
  id: string;
  project_id: string;
  source: string;
  label: string;
  value: string;
  delta: string | null;
  captured_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  label: string;
  occurred_on: string | null;
}

export interface ProjectDetail extends Project {
  phases: ProjectPhase[];
  quotes: Quote[];
  invoices: Invoice[];
  submissions: BountySubmission[];
  metrics: ProjectMetric[];
  milestones: Milestone[];
}

/**
 * Append-only audit trail for the two facts the Reward Vault's unlock rule
 * depends on: a project's `status` and whether it's been marked earned
 * (paid invoice, or the manual override for non-invoiced work). This is
 * what keeps the gate trustworthy over time — including to just yourself —
 * so rows here are never updated or deleted once written, only inserted.
 * Shared by the Reward Vault (reads it for the collapsible log panel) and
 * whatever writes a status/earned change (projects/actions.ts, billing).
 */
export interface ProjectStatusLogEntry {
  id: string;
  owner_id: string;
  project_id: string;
  project_name: string; // denormalised so the log reads even if the project is later deleted
  field_changed: 'status' | 'earned';
  from_value: string;
  to_value: string;
  changed_at: string;
  /** Required when field_changed === 'earned' and there's no real invoice
   *  behind it — documents what "paid" means for that project this time. */
  note: string | null;
}
