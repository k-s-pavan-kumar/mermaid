import { table } from '@/lib/data';
import { todayIso } from '@/lib/tz/today';
import { getFieldsSafe } from '@/features/tags/queries';
import type { Tag } from '@/features/tags/types';
import type { FinanceEntry } from '@/features/daily-finance/types';
import { addAuditPayments, clientProjectFields, fieldForIncome, makeReceivable, monthlyByField, type AttributionContext, type IncomeRow, type Receivable } from './compute';
import { balanceDue, invoiceMoney, isRecurringInvoice, type Invoice } from '@/features/billing/types';
import type { Task, FocusSession } from '@/features/today/types';

export interface FieldTarget { id: string; owner_id: string; field_id: string; year: number; amount: number; weights?: number[] | null; created_at: string }

export interface FieldCost { id: string; owner_id: string; field_id: string | null; product_id: string | null; date: string; amount: number; label: string; created_at: string }

export interface TargetData {
  fields: Tag[];
  /** field id -> yearly amount target (absent = none set). */
  targets: Map<string, number>;
  /** field id -> money received per month. */
  monthly: Map<string, number[]>;
  /** field id -> invoiced but not yet received, right now (all open invoices, whatever year they were issued). */
  outstanding: Map<string, number>;
  /** field id -> 12 non-negative numbers shaping the plan line; absent = even. */
  weights: Map<string, number[]>;
  /** field id -> the part of `monthly` that is recurring (retainers / subscriptions). */
  recurring: Map<string, number[]>;
  /** field id -> business costs per month. */
  costs: Map<string, number[]>;
  /** product id -> costs / revenue this year. */
  productCosts: Map<string, number>;
  productRevenue: Map<string, number>;
  /** field id -> minutes worked this year (task time + loose timer sessions on that field's projects). */
  minutes: Map<string, number>;
  /** Every open invoice (and unconverted TPN audit invoice) with what is owed, how late, and its field (null = none). */
  receivables: Receivable[];
  /** Money received this year that no field claims — shown so nothing silently goes missing. */
  unassigned: { id: string; date: string; amount: number; label: string; href: string | null; invoiceId: string | null }[];
}

/** Everything the target cards and charts need for one year. Missing tables just mean "nothing yet". */
export async function loadTargetData(ownerId: string, year: number): Promise<TargetData> {
  const fields = await getFieldsSafe(ownerId);

  let targets = new Map<string, number>();
  const weights = new Map<string, number[]>();
  try {
    const rows = await table<FieldTarget>('field_targets').where((t) => t.owner_id === ownerId && t.year === year);
    targets = new Map(rows.map((t) => [t.field_id, Number(t.amount)]));
    for (const t of rows) if (Array.isArray(t.weights) && t.weights.length === 12) weights.set(t.field_id, t.weights.map(Number));
  } catch { /* migration 022 not applied */ }

  const prefix = `${year}-`;
  const [income, projects, invoices, clients, tasks, sessions] = await Promise.all([
    table<FinanceEntry>('finance_entries').where((e) => e.owner_id === ownerId && e.type === 'income' && e.date.startsWith(prefix)),
    table<{ id: string; owner_id: string; field_id?: string | null; client_id?: string | null; product_id?: string | null }>('projects').where((p) => p.owner_id === ownerId),
    table<Invoice>('invoices').where((i) => i.owner_id === ownerId),
    table<{ id: string; owner_id: string; name: string; work_types?: string[] }>('clients').where((c) => c.owner_id === ownerId),
    table<Task>('tasks').where((t) => t.owner_id === ownerId && !!t.project_id),
    table<FocusSession>('focus_sessions').where((x) => x.owner_id === ownerId && !x.task_id && !!x.project_id),
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

  // Recurring part: payments on retainer / subscription invoices.
  const recurringInv = new Set(invoices.filter(isRecurringInvoice).map((i) => i.id));
  const recurring = monthlyByField(rows.filter((r) => r.linked_invoice_id && recurringInv.has(r.linked_invoice_id)), ctx, year);

  // Revenue per product: payments on the product's projects.
  const projectProduct = new Map(projects.map((p) => [p.id, p.product_id ?? null]));
  const invProject = new Map(invoices.map((i) => [i.id, i.project_id]));
  const productRevenue = new Map<string, number>();
  for (const r of rows) {
    const pid = r.linked_project_id ?? (r.linked_invoice_id ? invProject.get(r.linked_invoice_id) ?? null : null);
    const prod = pid ? projectProduct.get(pid) : null;
    if (prod && r.date.startsWith(prefix)) productRevenue.set(prod, Math.round(((productRevenue.get(prod) ?? 0) + r.amount) * 100) / 100);
  }

  // Outstanding: what open invoices still owe, credited to a field by the same rules as received money.
  const outstanding = new Map<string, number>(fields.map((f) => [f.id, 0]));
  const clientNameFor = new Map(clients.map((c) => [c.id, c.name]));
  const today = todayIso();
  const receivables: Receivable[] = [];
  for (const inv of invoices) {
    const owed = invoiceMoney(inv, recordedEver.get(inv.id) ?? 0).outstanding;
    if (owed <= 0) continue;
    const fid = fieldForIncome({ id: inv.id, date: inv.issued_at ?? '', amount: owed, source: 'invoice_payment', linked_invoice_id: inv.id }, ctx);
    if (fid && outstanding.has(fid)) outstanding.set(fid, Math.round(((outstanding.get(fid) ?? 0) + owed) * 100) / 100);
    receivables.push(makeReceivable({
      id: inv.id, number: inv.number, who: (inv.client_id && clientNameFor.get(inv.client_id)) || '', owed,
      issued: inv.issued_at ?? null, due: inv.due_at ?? null, fieldId: fid && outstanding.has(fid) ? fid : null, href: `/billing/invoices/${inv.id}`,
    }, today));
  }

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
        invoiceId: inv ? inv.id : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  try {
    type A = { id: string; owner_id: string; stage: string; client_name: string; company: string | null; invoice_ref: string | null;
      invoice_amount: number | null; invoice_sent_on: string | null; paid_amount: number; paid_on: string | null; billing_invoice_id?: string | null };
    // An audit turned into a real Billing invoice is counted through that invoice — never twice.
    const all = (await table<A>('audits').where((x) => x.owner_id === ownerId)).filter((x) => !x.billing_invoice_id);
    const tpnId = fields.find((f) => f.special === 'tpn')?.id ?? null;
    addAuditPayments(monthly, tpnId, all, year);
    if (tpnId) {
      let owedTotal = 0;
      for (const a of all.filter((x) => x.stage !== 'lost')) {
        const owed = Math.max(0, (a.invoice_amount ?? 0) - (a.paid_amount ?? 0));
        if (owed <= 0) continue;
        owedTotal += owed;
        receivables.push(makeReceivable({
          id: `audit-${a.id}`, number: a.invoice_ref ?? 'Audit invoice', who: a.company ? `${a.client_name} (${a.company})` : a.client_name,
          owed, issued: a.invoice_sent_on, due: null, fieldId: tpnId, href: '/tpn-audits',
        }, today));
      }
      outstanding.set(tpnId, Math.round(((outstanding.get(tpnId) ?? 0) + owedTotal) * 100) / 100);
    }
  } catch { /* audits table not there yet */ }

  // Costs per field per month, and per product.
  const costs = new Map<string, number[]>(fields.map((f) => [f.id, Array.from({ length: 12 }, () => 0)]));
  const productCosts = new Map<string, number>();
  try {
    const rowsC = await table<FieldCost>('field_costs').where((c) => c.owner_id === ownerId && c.date.startsWith(prefix));
    for (const c of rowsC) {
      const m = Number(c.date.slice(5, 7)) - 1;
      const arr = c.field_id ? costs.get(c.field_id) : undefined;
      if (arr && m >= 0 && m < 12) arr[m] = Math.round((arr[m]! + c.amount) * 100) / 100;
      if (c.product_id) productCosts.set(c.product_id, Math.round(((productCosts.get(c.product_id) ?? 0) + c.amount) * 100) / 100);
    }
  } catch { /* migration 024 not applied */ }

  // Minutes worked per field this year: task time plus timer sessions that aren't tied to a task.
  const minutes = new Map<string, number>(fields.map((f) => [f.id, 0]));
  const projectField = ctx.projectField;
  for (const t of tasks) {
    const fid = t.project_id ? projectField.get(t.project_id) : null;
    const when = t.scheduled_date ?? t.dump_date ?? '';
    if (fid && minutes.has(fid) && when.startsWith(prefix)) minutes.set(fid, (minutes.get(fid) ?? 0) + Math.max(0, t.logged_minutes ?? 0));
  }
  for (const x of sessions) {
    const fid = x.project_id ? projectField.get(x.project_id) : null;
    if (fid && minutes.has(fid) && x.date.startsWith(prefix)) minutes.set(fid, (minutes.get(fid) ?? 0) + Math.max(0, x.completed_minutes ?? 0));
  }

  return { fields, targets, weights, monthly, recurring, costs, productCosts, productRevenue, minutes, receivables, outstanding, unassigned };
}

/** Costs for one field or product in a year, newest first. */
export async function getFieldCosts(ownerId: string, year: number, scope: { fieldId?: string; productId?: string }): Promise<FieldCost[]> {
  try {
    const rows = await table<FieldCost>('field_costs').where((c) =>
      c.owner_id === ownerId && c.date.startsWith(`${year}-`) && (scope.fieldId ? c.field_id === scope.fieldId : true) && (scope.productId ? c.product_id === scope.productId : true));
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}
