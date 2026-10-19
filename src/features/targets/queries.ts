import { table } from '@/lib/data';
import { getFieldsSafe } from '@/features/tags/queries';
import type { Tag } from '@/features/tags/types';
import type { FinanceEntry } from '@/features/daily-finance/types';
import { addAuditPayments, clientProjectFields, fieldForIncome, monthlyByField, type AttributionContext, type IncomeRow } from './compute';
import { balanceDue, type Invoice } from '@/features/billing/types';

export interface FieldTarget { id: string; owner_id: string; field_id: string; year: number; amount: number; created_at: string }

export interface TargetData {
  fields: Tag[];
  /** field id -> yearly amount target (absent = none set). */
  targets: Map<string, number>;
  /** field id -> money received per month. */
  monthly: Map<string, number[]>;
  /** Money received this year that no field claims — shown so nothing silently goes missing. */
  unassigned: { id: string; date: string; amount: number; label: string; href: string | null }[];
}

/** Everything the target cards and charts need for one year. Missing tables just mean "nothing yet". */
export async function loadTargetData(ownerId: string, year: number): Promise<TargetData> {
  const fields = await getFieldsSafe(ownerId);

  let targets = new Map<string, number>();
  try {
    const rows = await table<FieldTarget>('field_targets').where((t) => t.owner_id === ownerId && t.year === year);
    targets = new Map(rows.map((t) => [t.field_id, Number(t.amount)]));
  } catch { /* migration 022 not applied */ }

  const prefix = `${year}-`;
  const [income, projects, invoices, clients] = await Promise.all([
    table<FinanceEntry>('finance_entries').where((e) => e.owner_id === ownerId && e.type === 'income' && e.date.startsWith(prefix)),
    table<{ id: string; owner_id: string; field_id?: string | null; client_id?: string | null }>('projects').where((p) => p.owner_id === ownerId),
    table<Invoice>('invoices').where((i) => i.owner_id === ownerId),
    table<{ id: string; owner_id: string; name: string; work_types?: string[] }>('clients').where((c) => c.owner_id === ownerId),
  ]);

  const ctx: AttributionContext = {
    fields: fields.map((f) => ({ id: f.id, name: f.name, special: f.special })),
    projectField: new Map(projects.map((p) => [p.id, p.field_id ?? null])),
    invoices: new Map(invoices.map((i) => [i.id, { project_id: i.project_id, client_id: i.client_id, stream: i.stream }])),
    clientTags: new Map(clients.map((c) => [c.id, c.work_types ?? []])),
    clientProjectField: clientProjectFields(projects),
  };

  // Business receipts only: invoice payments and bounty payouts (not salary, refunds, etc.).
  const rows: IncomeRow[] = income
    .filter((e) => e.source === 'invoice_payment' || e.source === 'bounty_payout')
    .map((e) => ({ id: e.id, date: e.date, amount: e.amount, source: e.source,
      linked_project_id: e.linked_project_id, linked_invoice_id: e.linked_invoice_id, linked_bounty_id: e.linked_bounty_id }));

  // An invoice marked "paid" with no (or not enough) payment recorded still counts as received,
  // in the month it was paid — the same rule the rest of the app uses (see invoiceMoney).
  const allPayments = await table<FinanceEntry>('finance_entries').where((e) => e.owner_id === ownerId && e.source === 'invoice_payment' && !!e.linked_invoice_id);
  const recordedEver = new Map<string, number>();
  for (const e of allPayments) recordedEver.set(e.linked_invoice_id as string, (recordedEver.get(e.linked_invoice_id as string) ?? 0) + e.amount);
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    const missing = balanceDue(inv, recordedEver.get(inv.id) ?? 0);
    const when = inv.paid_at ?? inv.issued_at;
    if (missing > 0 && when && when.startsWith(prefix)) {
      rows.push({ id: `unrecorded-${inv.id}`, date: when, amount: missing, source: 'invoice_payment', linked_invoice_id: inv.id });
    }
  }

  const monthly = monthlyByField(rows, ctx, year);

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const unassigned = rows
    .filter((r) => r.amount > 0 && !fieldForIncome(r, ctx))
    .map((r) => {
      const inv = r.linked_invoice_id ? invById.get(r.linked_invoice_id) : undefined;
      const who = inv?.client_id ? clientName.get(inv.client_id) : undefined;
      return {
        id: r.id, date: r.date, amount: r.amount,
        label: inv ? `Invoice ${inv.number}${who ? ` · ${who}` : ''}` : r.source === 'bounty_payout' ? 'Bug bounty payout' : 'Payment',
        href: inv ? `/billing/invoices/${inv.id}` : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  try {
    const audits = await table<{ id: string; owner_id: string; paid_amount: number; paid_on: string | null }>('audits').where((a) => a.owner_id === ownerId);
    addAuditPayments(monthly, fields.find((f) => f.special === 'tpn')?.id ?? null, audits, year);
  } catch { /* audits table not there yet */ }

  return { fields, targets, monthly, unassigned };
}
