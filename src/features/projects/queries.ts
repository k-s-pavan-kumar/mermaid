import { table } from '@/lib/data';
import { hasType } from '@/lib/project-colors';
import { sumInvoiceMoney } from '@/features/billing/types';
import type {
  Project,
  ProjectDetail,
  ProjectPhase,
  Quote,
  Invoice,
  BountySubmission,
  ProjectMetric,
  Milestone,
  ProjectType,
} from './types';

/** Filtering matches ANY of a project's types, not just the primary one —
 *  otherwise a project tagged both "Open Source" and "Web App" would go
 *  missing from one of those two filters. */
export async function getProjects(type?: ProjectType): Promise<Project[]> {
  const projects = await table<Project>('projects').all();
  return type ? projects.filter((p) => hasType(p, type)) : projects;
}

export async function getProjectById(id: string): Promise<ProjectDetail | undefined> {
  const project = await table<Project>('projects').find(id);
  if (!project) return undefined;

  const [phases, quotes, invoices, submissions, metrics, milestones] = await Promise.all([
    table<ProjectPhase>('project_phases').where((p) => p.project_id === id),
    table<Quote>('quotes').where((q) => q.project_id === id),
    table<Invoice>('invoices').where((i) => i.project_id === id),
    table<BountySubmission>('bounty_submissions').where((s) => s.project_id === id),
    table<ProjectMetric>('project_metrics').where((m) => m.project_id === id),
    table<Milestone>('milestones').where((m) => m.project_id === id),
  ]);

  return {
    ...project,
    phases: phases.sort((a, b) => a.sort_order - b.sort_order),
    quotes,
    invoices,
    submissions,
    metrics,
    milestones: milestones.sort((a, b) => (a.occurred_on ?? '').localeCompare(b.occurred_on ?? '')),
  };
}

// Earnings roll-up used by the Dashboard's Earnings card and the
// billing tab's summary boxes — one place doing the invoice math so
// both stay in sync.
export async function getEarningsSummary(projectId?: string) {
  const [allInvoices, allBounties] = await Promise.all([
    table<Invoice>('invoices').all(),
    table<BountySubmission>('bounty_submissions').all(),
  ]);

  const invoices = allInvoices.filter((i) => !projectId || i.project_id === projectId);
  const bounties = allBounties.filter((s) => !projectId || s.project_id === projectId);

  const entries = await table<{ id: string; source: string; linked_invoice_id?: string | null; amount: number }>('finance_entries').where(
    (e) => e.source === 'invoice_payment' && !!e.linked_invoice_id
  );
  const paidTotals = new Map<string, number>();
  for (const e of entries) paidTotals.set(e.linked_invoice_id as string, (paidTotals.get(e.linked_invoice_id as string) ?? 0) + e.amount);
  const m = sumInvoiceMoney(invoices, paidTotals);
  const invoiced = m.billed;
  const paid = m.cleared;
  const bountyPaid = bounties.reduce((sum, s) => sum + (s.payout ?? 0), 0);

  return {
    invoiced,
    paid: paid + bountyPaid,
    outstanding: m.outstanding,
    bountyPaid,
  };
}
