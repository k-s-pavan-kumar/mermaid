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
 *   5. a bounty payout -> the Bug Bounty field
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
