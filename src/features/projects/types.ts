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
  | 'bounty';
export type ProjectStatus = 'idea' | 'ontrack' | 'review' | 'risk' | 'done';

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
  created_at: string;
}

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
