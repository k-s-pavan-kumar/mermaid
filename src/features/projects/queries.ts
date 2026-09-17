import { table } from '@/lib/data';
import { hasType } from '@/lib/project-colors';
import { grandTotal } from '@/features/billing/types';
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

  const invoiced = invoices.filter((i) => i.status !== 'draft').reduce((sum, i) => sum + grandTotal(i), 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + grandTotal(i), 0);
  const bountyPaid = bounties.reduce((sum, s) => sum + (s.payout ?? 0), 0);

  return {
    invoiced,
    paid: paid + bountyPaid,
    outstanding: invoiced - paid,
    bountyPaid,
  };
}
