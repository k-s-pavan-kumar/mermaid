/**
 * TPN audit tracker. One Audit = one client engagement, carried from first
 * contact to getting paid, with its own quote and invoice fields. Deliberately
 * separate from Clients/Billing so audit work doesn't mix into those totals.
 */
export type AuditStage = 'lead' | 'scoping' | 'quoted' | 'accepted' | 'in_progress' | 'report' | 'invoiced' | 'paid' | 'lost';

export const AUDIT_STAGES: AuditStage[] = ['lead', 'scoping', 'quoted', 'accepted', 'in_progress', 'report', 'invoiced', 'paid', 'lost'];

export const AUDIT_STAGE_LABEL: Record<AuditStage, string> = {
  lead: 'Lead',
  scoping: 'Scoping',
  quoted: 'Quote sent',
  accepted: 'Quote accepted',
  in_progress: 'Audit in progress',
  report: 'Report delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  lost: 'Lost',
};

export interface Audit {
  id: string;
  owner_id: string;
  client_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  scope: string | null;
  stage: AuditStage;
  quote_amount: number | null;
  quote_sent_on: string | null;
  quote_ref: string | null;
  invoice_amount: number | null;
  invoice_ref: string | null;
  invoice_sent_on: string | null;
  paid_amount: number;
  paid_on: string | null;
  audit_date: string | null;
  goal_id: string | null;
  /** 'YYYY-MM' inside the goal's year. */
  goal_month: string | null;
  notes: string | null;
  created_at: string;
}

/** An audit counts toward a goal once the work is delivered. */
export const isAuditComplete = (a: Pick<Audit, 'stage'>) => a.stage === 'report' || a.stage === 'invoiced' || a.stage === 'paid';

export interface AuditTotals {
  active: number;       // not paid, not lost
  quoted: number;       // total value of quotes on open (not lost) audits
  invoiced: number;     // total invoiced
  received: number;     // total paid
  outstanding: number;  // invoiced minus received, never negative per audit
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function auditTotals(audits: Audit[]): AuditTotals {
  const t: AuditTotals = { active: 0, quoted: 0, invoiced: 0, received: 0, outstanding: 0 };
  for (const a of audits) {
    if (a.stage !== 'paid' && a.stage !== 'lost') t.active++;
    if (a.stage !== 'lost') t.quoted += a.quote_amount ?? 0;
    t.invoiced += a.invoice_amount ?? 0;
    t.received += a.paid_amount ?? 0;
    t.outstanding += Math.max(0, (a.invoice_amount ?? 0) - (a.paid_amount ?? 0));
  }
  return { active: t.active, quoted: r2(t.quoted), invoiced: r2(t.invoiced), received: r2(t.received), outstanding: r2(t.outstanding) };
}
