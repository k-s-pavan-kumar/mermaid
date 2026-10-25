/**
 * Yearly money targets per field — pure maths, no database.
 *
 * "Reached" is money actually received, read from Daily Finance income rows
 * (invoice payments, bounty payouts). Each row is credited to ONE field, by the
 * first rule that applies:
 *   1. the project on the entry, if that project sits in a field
 *   2. the invoice's project, if that sits in a field (an own project's invoice)
 *   3. an invoice with stream 'bounty' -> the Bug Bounty field
 *   4. the invoice's client, if one of their work-type tags is a field's name
 *   5. the invoice's client, if their projects sit in a field (the most-used one)
 *   6. a bounty payout -> the Bug Bounty field
 * Anything else counts toward no field. One row never counts twice.
 * TPN audits are tracked on their own page, so their received amounts are added
 * to the TPN field by the month they were paid.
 */
export interface IncomeRow {
  id: string;
  date: string; // 'YYYY-MM-DD'
  amount: number;
  source: string;
  linked_project_id?: string | null;
  linked_invoice_id?: string | null;
  linked_bounty_id?: string | null;
}

export interface FieldRef { id: string; name: string; special: 'tpn' | 'bounty' | null }

export interface AttributionContext {
  /** In display order — rule 4 picks the first field whose name matches. */
  fields: FieldRef[];
  projectField: Map<string, string | null>;
  invoices: Map<string, { project_id: string | null; client_id: string | null; stream: string }>;
  clientTags: Map<string, string[]>;
  /** client id -> the field most of that client's projects sit in. */
  clientProjectField?: Map<string, string>;
}

export function fieldForIncome(e: IncomeRow, ctx: AttributionContext): string | null {
  const bounty = ctx.fields.find((f) => f.special === 'bounty')?.id ?? null;
  if (e.linked_project_id) {
    const f = ctx.projectField.get(e.linked_project_id);
    if (f) return f;
  }
  const inv = e.linked_invoice_id ? ctx.invoices.get(e.linked_invoice_id) : undefined;
  if (inv) {
    if (inv.project_id) {
      const f = ctx.projectField.get(inv.project_id);
      if (f) return f;
    }
    if (inv.stream === 'bounty' && bounty) return bounty;
    if (inv.client_id) {
      const tags = (ctx.clientTags.get(inv.client_id) ?? []).map((t) => t.toLowerCase());
      const hit = ctx.fields.find((f) => tags.includes(f.name.toLowerCase()));
      if (hit) return hit.id;
      const viaProjects = ctx.clientProjectField?.get(inv.client_id);
      if (viaProjects) return viaProjects;
    }
  }
  if ((e.source === 'bounty_payout' || e.linked_bounty_id) && bounty) return bounty;
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const zeros = () => Array.from({ length: 12 }, () => 0);

/** Money received per field per month (index 0 = January) for one year. */
export function monthlyByField(rows: IncomeRow[], ctx: AttributionContext, year: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const f of ctx.fields) out.set(f.id, zeros());
  const prefix = `${year}-`;
  for (const e of rows) {
    if (!e.date.startsWith(prefix) || !(e.amount > 0)) continue;
    const id = fieldForIncome(e, ctx);
    const m = Number(e.date.slice(5, 7)) - 1;
    const arr = id ? out.get(id) : undefined;
    if (arr && m >= 0 && m < 12) arr[m] = r2(arr[m]! + e.amount);
  }
  return out;
}

/** Add TPN audit payments (by the month they were paid) to the TPN field's months. */
export function addAuditPayments(
  monthly: Map<string, number[]>, tpnFieldId: string | null,
  audits: { paid_amount: number; paid_on: string | null }[], year: number,
): void {
  const arr = tpnFieldId ? monthly.get(tpnFieldId) : undefined;
  if (!arr) return;
  for (const a of audits) {
    if (!a.paid_on || !a.paid_on.startsWith(`${year}-`) || !(a.paid_amount > 0)) continue;
    const m = Number(a.paid_on.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) arr[m] = r2(arr[m]! + a.paid_amount);
  }
}

export interface TargetSummary {
  target: number;
  reached: number;
  /** What is still to be received to hit the target; never negative. */
  pending: number;
  /** 0–100, capped. */
  pct: number;
  monthly: number[];
  /** Running total by month; null for months that haven't happened yet. */
  cumulative: (number | null)[];
  /** Straight-line plan: target × (month+1)/12. */
  pace: number[];
  /** What the plan says should be in by the end of this month. */
  expectedToDate: number;
  /** reached − expectedToDate: positive = ahead of plan. */
  gap: number;
  /** Per remaining month (this one included) to still make the target; null once the year is over or nothing is pending. */
  neededPerMonth: number | null;
}

/** Index of the current month inside `year`: 11 for a past year, -1 for a future one. */
export function nowIndex(year: number, today: string): number {
  const ty = Number(today.slice(0, 4));
  if (year < ty) return 11;
  if (year > ty) return -1;
  return Number(today.slice(5, 7)) - 1;
}

export function summarise(target: number, monthly: number[], nowIdx: number): TargetSummary {
  const reached = r2(monthly.reduce((a, b) => a + b, 0));
  let run = 0;
  const cumulative = monthly.map((v, i) => { run = r2(run + v); return i <= nowIdx ? run : null; });
  const pace = monthly.map((_, i) => r2((target * (i + 1)) / 12));
  const expectedToDate = nowIdx >= 0 ? pace[nowIdx]! : 0;
  const pending = Math.max(0, r2(target - reached));
  const monthsLeft = nowIdx >= 0 && nowIdx < 11 ? 12 - nowIdx : nowIdx === -1 ? 12 : 0;
  return {
    target, reached, pending,
    pct: target > 0 ? Math.min(100, Math.round((reached / target) * 100)) : 0,
    monthly, cumulative, pace, expectedToDate,
    gap: r2(reached - expectedToDate),
    neededPerMonth: pending > 0 && monthsLeft > 0 ? Math.ceil(pending / monthsLeft) : null,
  };
}

/** Sum several fields' months into one series (for the all-fields view). */
export function sumMonthly(series: number[][]): number[] {
  return zeros().map((_, i) => r2(series.reduce((a, s) => a + (s[i] ?? 0), 0)));
}

/** The field most of a client's projects sit in, per client. Ties go to the first seen. */
export function clientProjectFields(projects: { client_id?: string | null; field_id?: string | null }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of projects) {
    if (!p.client_id || !p.field_id) continue;
    const m = counts.get(p.client_id) ?? new Map<string, number>();
    m.set(p.field_id, (m.get(p.field_id) ?? 0) + 1);
    counts.set(p.client_id, m);
  }
  const out = new Map<string, string>();
  for (const [client, m] of counts) {
    let best = ''; let n = 0;
    for (const [f, c] of m) if (c > n) { best = f; n = c; }
    if (best) out.set(client, best);
  }
  return out;
}

/**
 * How the money still to earn splits: part is already invoiced and waiting
 * (outstanding), the rest has not been billed yet.
 */
export function pipeline(pending: number, outstanding: number): { stillToInvoice: number; covered: boolean } {
  const stillToInvoice = Math.max(0, Math.round((pending - outstanding) * 100) / 100);
  return { stillToInvoice, covered: pending > 0 && outstanding >= pending };
}

/**
 * Overall progress across fields that have a goal. Each field counts toward
 * its own goal only up to that goal: a field that overshoots must not hide
 * what another field still lacks. Fields without a goal are left out.
 */
export function overallProgress(rows: { target: number; reached: number; pending: number; outstanding: number }[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const withGoal = rows.filter((r) => r.target > 0);
  const target = withGoal.reduce((a, r) => a + r.target, 0);
  const counted = withGoal.reduce((a, r) => a + Math.min(r.reached, r.target), 0);
  const pending = withGoal.reduce((a, r) => a + r.pending, 0);
  const over = withGoal.reduce((a, r) => a + Math.max(0, r.reached - r.target), 0);
  const outstanding = withGoal.reduce((a, r) => a + r.outstanding, 0);
  return {
    target: r2(target), counted: r2(counted), pending: r2(pending), over: r2(over), outstanding: r2(outstanding),
    pct: target > 0 ? Math.min(100, Math.round((counted / target) * 100)) : 0,
  };
}

// ---------------------------------------------------------------------------
// Monthly shape (non-flat plans), forecast, receivables, profit, hours
// ---------------------------------------------------------------------------

/** Cumulative plan share by month from 12 weights (null/invalid = even). Index i = share by end of month i, 0..1. */
export function planShares(weights: number[] | null | undefined): number[] {
  const w = weights && weights.length === 12 && weights.every((x) => Number.isFinite(x) && x >= 0) && weights.some((x) => x > 0)
    ? weights : Array.from({ length: 12 }, () => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let run = 0;
  return w.map((x) => { run += x; return run / total; });
}

export const WEIGHT_PRESETS: { key: string; label: string; weights: number[] }[] = [
  { key: 'even', label: 'Even every month', weights: Array.from({ length: 12 }, () => 1) },
  { key: 'back', label: 'Back-loaded (builds up)', weights: [1, 1, 1, 1, 1, 1, 1.5, 1.5, 1.5, 2, 2, 2] },
  { key: 'front', label: 'Front-loaded', weights: [2, 2, 2, 1.5, 1.5, 1.5, 1, 1, 1, 1, 1, 1] },
  { key: 'launch', label: 'Quiet, then a launch spike (Q4)', weights: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 2, 3, 3] },
];

/** Same as summarise(), but the plan line follows `weights` instead of a straight line. */
export function summariseShaped(target: number, monthly: number[], nowIdx: number, weights?: number[] | null): TargetSummary {
  const base = summarise(target, monthly, nowIdx);
  if (!weights) return base;
  const shares = planShares(weights);
  const pace = shares.map((sh) => Math.round(target * sh * 100) / 100);
  const expectedToDate = nowIdx >= 0 ? pace[nowIdx]! : 0;
  return { ...base, pace, expectedToDate, gap: Math.round((base.reached - expectedToDate) * 100) / 100 };
}

export interface Forecast {
  /** Where the year ends if the pace so far simply continues. */
  projected: number;
  shortBy: number;
  onPace: boolean;
  /** Still to bill beyond what is already outstanding to reach the goal. */
  toBill: number;
  /** null when the year is over or hasn't started. */
  basis: 'run-rate' | 'final' | 'none';
}

/** Straight run-rate: reached ÷ time elapsed, carried to December. Honest about being a projection. */
export function forecast(target: number, reached: number, outstanding: number, year: number, today: string): Forecast {
  const ty = Number(today.slice(0, 4));
  const pending = Math.max(0, target - reached);
  const toBill = Math.max(0, Math.round((pending - outstanding) * 100) / 100);
  if (year < ty) return { projected: reached, shortBy: Math.max(0, target - reached), onPace: reached >= target, toBill: 0, basis: 'final' };
  if (year > ty) return { projected: 0, shortBy: target, onPace: false, toBill, basis: 'none' };
  const m = Number(today.slice(5, 7)) - 1;
  const day = Number(today.slice(8, 10));
  const dim = new Date(year, m + 1, 0).getDate();
  const elapsed = m + day / dim; // months elapsed, fractional
  if (elapsed <= 0) return { projected: 0, shortBy: target, onPace: false, toBill, basis: 'none' };
  const projected = Math.round((reached + (reached / elapsed) * (12 - elapsed)) * 100) / 100;
  return { projected, shortBy: Math.max(0, Math.round((target - projected) * 100) / 100), onPace: projected >= target, toBill, basis: 'run-rate' };
}

// ----- receivables (aging) -------------------------------------------------

export type AgingBucket = 'notdue' | 'd30' | 'd60' | 'd60plus';
export const AGING_LABEL: Record<AgingBucket, string> = { notdue: 'Not due yet', d30: '1–30 days late', d60: '31–60 days late', d60plus: '60+ days late' };

export interface Receivable {
  id: string;
  number: string;
  who: string;
  owed: number;
  issued: string | null;
  due: string | null;
  /** Days past the due date (due date, else issue date); 0 or less = not late. */
  daysLate: number;
  bucket: AgingBucket;
  fieldId: string | null;
  href: string | null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
}

export function agingBucket(daysLate: number): AgingBucket {
  return daysLate <= 0 ? 'notdue' : daysLate <= 30 ? 'd30' : daysLate <= 60 ? 'd60' : 'd60plus';
}

export function makeReceivable(
  r: { id: string; number: string; who: string; owed: number; issued: string | null; due: string | null; fieldId: string | null; href: string | null },
  today: string,
): Receivable {
  const basis = r.due ?? r.issued;
  const daysLate = basis ? daysBetween(basis, today) : 0;
  return { ...r, daysLate, bucket: agingBucket(daysLate) };
}

export function agingTotals(rs: Receivable[]): Record<AgingBucket, { count: number; amount: number }> {
  const out: Record<AgingBucket, { count: number; amount: number }> = {
    notdue: { count: 0, amount: 0 }, d30: { count: 0, amount: 0 }, d60: { count: 0, amount: 0 }, d60plus: { count: 0, amount: 0 },
  };
  for (const r of rs) { out[r.bucket].count++; out[r.bucket].amount = Math.round((out[r.bucket].amount + r.owed) * 100) / 100; }
  return out;
}

/** A polite, ready-to-send reminder. Plain text so it pastes into WhatsApp, email or SMS. */
export function reminderText(r: Pick<Receivable, 'number' | 'who' | 'owed' | 'due' | 'daysLate'>, sender?: string): string {
  const amt = '₹' + Math.round(r.owed).toLocaleString('en-IN');
  const when = r.due ? ` (due ${r.due})` : '';
  const late = r.daysLate > 0 ? ` It is now ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} past the due date.` : '';
  return `Hi ${r.who || 'there'}, a gentle reminder that invoice ${r.number} for ${amt}${when} is still open.${late} Could you let me know when I can expect the payment? Happy to resend the invoice if useful. Thank you!${sender ? `\n\n${sender}` : ''}`;
}

// ----- profit, hours, recurring --------------------------------------------

export interface Profit { revenue: number; costs: number; profit: number; marginPct: number | null }

export function profitOf(revenue: number, costs: number): Profit {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { revenue: r2(revenue), costs: r2(costs), profit: r2(revenue - costs), marginPct: revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : null };
}

/** Effective hourly rate: money ÷ hours, whole rupees; null with no hours or no money. */
export function effectiveRate(money: number, minutes: number): number | null {
  return minutes > 0 && money > 0 ? Math.round(money / (minutes / 60)) : null;
}

/** Average of the last `n` months up to and including `nowIdx` (default 3), for recurring monthly revenue. */
export function recentMonthlyAverage(monthly: number[], nowIdx: number, n = 3): number {
  if (nowIdx < 0) return 0;
  const from = Math.max(0, nowIdx - n + 1);
  const slice = monthly.slice(from, nowIdx + 1);
  return slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : 0;
}
