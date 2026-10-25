/**
 * Tax summary by Indian financial year (April–March): GST collected, TDS
 * deducted, per month and per client, plus a CSV. Pure — no database.
 * An invoice counts in the FY of its issue date; drafts count for nothing.
 */
import { grandTotal, subtotal, taxAmount, type Invoice } from '@/features/billing/types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Start year of the financial year a date falls in: Apr 2026 – Mar 2027 → 2026. */
export function fyOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? y : y - 1;
}
export const fyLabel = (fy: number) => `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;

/** 'YYYY-MM' months of a FY, April first. */
export function fyMonths(fy: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 3) % 12) + 1;
    const y = m >= 4 ? fy : fy + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}

export interface TaxRow { month: string; invoices: number; taxable: number; gst: number; tds: number; billed: number }
export interface TdsClientRow { clientId: string | null; name: string; invoices: number; billed: number; tds: number }
export interface TaxSummary {
  fy: number;
  months: TaxRow[];
  quarters: { label: string; taxable: number; gst: number; tds: number }[];
  totals: { invoices: number; taxable: number; gst: number; tds: number; billed: number };
  byClient: TdsClientRow[];
}

export function taxSummary(invoices: Invoice[], clientName: Map<string, string>, fy: number): TaxSummary {
  const months = fyMonths(fy).map((month): TaxRow => ({ month, invoices: 0, taxable: 0, gst: 0, tds: 0, billed: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const clients = new Map<string, TdsClientRow>();
  for (const inv of invoices) {
    if (inv.status === 'draft' || !inv.issued_at || fyOf(inv.issued_at) !== fy) continue;
    const row = byMonth.get(inv.issued_at.slice(0, 7));
    if (!row) continue;
    const taxable = subtotal(inv), gst = taxAmount(inv), tds = inv.tds_amount ?? 0, billed = grandTotal(inv);
    row.invoices++; row.taxable = r2(row.taxable + taxable); row.gst = r2(row.gst + gst); row.tds = r2(row.tds + tds); row.billed = r2(row.billed + billed);
    const key = inv.client_id ?? '';
    const c = clients.get(key) ?? { clientId: inv.client_id, name: (inv.client_id && clientName.get(inv.client_id)) || 'No client (own projects)', invoices: 0, billed: 0, tds: 0 };
    c.invoices++; c.billed = r2(c.billed + billed); c.tds = r2(c.tds + tds);
    clients.set(key, c);
  }
  const sum = (rows: TaxRow[]) => rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, tds: a.tds + r.tds }), { taxable: 0, gst: 0, tds: 0 });
  const quarters = [0, 1, 2, 3].map((q) => {
    const s = sum(months.slice(q * 3, q * 3 + 3));
    return { label: `Q${q + 1} (${['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'][q]})`, taxable: r2(s.taxable), gst: r2(s.gst), tds: r2(s.tds) };
  });
  return {
    fy, months, quarters,
    totals: {
      invoices: months.reduce((a, m) => a + m.invoices, 0), taxable: r2(months.reduce((a, m) => a + m.taxable, 0)),
      gst: r2(months.reduce((a, m) => a + m.gst, 0)), tds: r2(months.reduce((a, m) => a + m.tds, 0)), billed: r2(months.reduce((a, m) => a + m.billed, 0)),
    },
    byClient: [...clients.values()].sort((a, b) => b.tds - a.tds || b.billed - a.billed),
  };
}

const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV with a monthly section and a per-client TDS section. */
export function taxCsv(s: TaxSummary, matched: Set<string>): string {
  const lines: string[] = [`${fyLabel(s.fy)} tax summary`, '', 'Month,Invoices,Taxable value,GST collected,TDS deducted,Total billed'];
  for (const m of s.months) lines.push([m.month, m.invoices, m.taxable, m.gst, m.tds, m.billed].map(esc).join(','));
  lines.push(['Total', s.totals.invoices, s.totals.taxable, s.totals.gst, s.totals.tds, s.totals.billed].map(esc).join(','));
  lines.push('', 'Client,Invoices,Total billed,TDS deducted,Matched with 26AS');
  for (const c of s.byClient) lines.push([c.name, c.invoices, c.billed, c.tds, c.tds > 0 ? (matched.has(c.clientId ?? '') ? 'Yes' : 'No') : 'n/a'].map(esc).join(','));
  return lines.join('\n') + '\n';
}
