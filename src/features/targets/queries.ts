import { table } from '@/lib/data';
import { getFieldsSafe } from '@/features/tags/queries';
import type { Tag } from '@/features/tags/types';
import type { FinanceEntry } from '@/features/daily-finance/types';
import { addAuditPayments, monthlyByField, type AttributionContext } from './compute';

export interface FieldTarget { id: string; owner_id: string; field_id: string; year: number; amount: number; created_at: string }

export interface TargetData {
  fields: Tag[];
  /** field id -> yearly amount target (absent = none set). */
  targets: Map<string, number>;
  /** field id -> money received per month. */
  monthly: Map<string, number[]>;
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
    table<{ id: string; owner_id: string; field_id?: string | null }>('projects').where((p) => p.owner_id === ownerId),
    table<{ id: string; owner_id: string; project_id: string | null; client_id: string | null; stream: string }>('invoices').where((i) => i.owner_id === ownerId),
    table<{ id: string; owner_id: string; work_types?: string[] }>('clients').where((c) => c.owner_id === ownerId),
  ]);

  const ctx: AttributionContext = {
    fields: fields.map((f) => ({ id: f.id, name: f.name, special: f.special })),
    projectField: new Map(projects.map((p) => [p.id, p.field_id ?? null])),
    invoices: new Map(invoices.map((i) => [i.id, { project_id: i.project_id, client_id: i.client_id, stream: i.stream }])),
    clientTags: new Map(clients.map((c) => [c.id, c.work_types ?? []])),
  };
  const monthly = monthlyByField(
    income.map((e) => ({ id: e.id, date: e.date, amount: e.amount, source: e.source,
      linked_project_id: e.linked_project_id, linked_invoice_id: e.linked_invoice_id, linked_bounty_id: e.linked_bounty_id })),
    ctx, year,
  );

  try {
    const audits = await table<{ id: string; owner_id: string; paid_amount: number; paid_on: string | null }>('audits').where((a) => a.owner_id === ownerId);
    addAuditPayments(monthly, fields.find((f) => f.special === 'tpn')?.id ?? null, audits, year);
  } catch { /* audits table not there yet */ }

  return { fields, targets, monthly };
}
