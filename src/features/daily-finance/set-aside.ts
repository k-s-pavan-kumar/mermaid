/**
 * Set-asides (a % of every invoice payment goes to someone, e.g. a sister)
 * and the investment log.
 *
 * Set-asides follow Daily Finance's rule that nobody types these ledger rows
 * in: one is DERIVED from a real invoice payment — applySplitsForPayment() is
 * called the moment a payment is recorded — and is undone or recomputed when
 * that payment is deleted or its TDS corrected.
 *
 * The investment log is the opposite, on purpose: a plain hand-kept list
 * (amount, invested in, date) that reads nothing from invoices or the ledger
 * and writes nothing to them.
 *
 * Pure DB work, no revalidatePath(): so this can be exercised by the verify
 * suite outside a Next.js request (see scripts/verify-set-aside.ts).
 */
import { table } from '@/lib/data';
import { newId } from '@/lib/id';
import type { FinanceEntry, FinanceSplitRule, InvestmentLogEntry, SetAsideSummary } from './types';
import { FAMILY_CATEGORY_PREFIX, splitCategory } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Pure maths
// ---------------------------------------------------------------------------

/** `pct`% of `received`, to the paisa. */
export function splitShare(received: number, pct: number): number {
  return r2((Math.max(0, received) * pct) / 100);
}

/**
 * What each ACTIVE rule takes from a payment of `received`. Zero-paisa
 * shares are dropped. Because per-rule rounding can add up to a hair more
 * than the payment (3 × 33.333%), the total is clamped so the set-asides can
 * never exceed what actually came in.
 */
export function planSplits(received: number, rules: FinanceSplitRule[]): { rule: FinanceSplitRule; amount: number }[] {
  const plan = rules
    .filter((r) => r.active && r.pct > 0 && r.pct <= 100)
    .map((rule) => ({ rule, amount: splitShare(received, rule.pct) }))
    .filter((p) => p.amount > 0);
  let over = r2(plan.reduce((n, p) => n + p.amount, 0) - Math.max(0, received));
  for (let i = plan.length - 1; i >= 0 && over > 0; i--) {
    const take = Math.min(over, plan[i]!.amount);
    plan[i]!.amount = r2(plan[i]!.amount - take);
    over = r2(over - take);
  }
  return plan.filter((p) => p.amount > 0);
}

/** Percent as shown in notes: 10 → "10", 7.5 → "7.5". */
export function fmtPct(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function getSplitRules(ownerId: string): Promise<FinanceSplitRule[]> {
  const rows = await table<FinanceSplitRule>('finance_split_rules').where((r) => r.owner_id === ownerId);
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveSplitRule(input: { ownerId: string; id?: string | null; label: string; pct: number }): Promise<SaveResult> {
  const label = input.label.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!label) return { ok: false, error: 'Who is this for? Give it a name, e.g. “Sister”.' };
  if (!Number.isFinite(input.pct) || input.pct <= 0 || input.pct > 100) return { ok: false, error: 'Percentage must be between 0 and 100.' };

  const rules = await getSplitRules(input.ownerId);
  const existing = input.id ? rules.find((r) => r.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, error: 'That rule no longer exists.' };

  // The shares are taken from the same payment, so they can't total over 100%.
  const othersTotal = rules.filter((r) => r.active && r.id !== input.id).reduce((n, r) => n + r.pct, 0);
  if (othersTotal + input.pct > 100.0001) {
    return { ok: false, error: `Your other active rules already take ${fmtPct(othersTotal)}% — this would total over 100%.` };
  }

  if (existing) {
    await table<FinanceSplitRule>('finance_split_rules').update(existing.id, { label, pct: input.pct });
    return { ok: true, id: existing.id };
  }
  const id = newId();
  await table<FinanceSplitRule>('finance_split_rules').insert({
    id, owner_id: input.ownerId, label, pct: input.pct, active: true, created_at: new Date().toISOString(),
  });
  return { ok: true, id };
}

export async function setSplitRuleActive(ownerId: string, id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const rule = await table<FinanceSplitRule>('finance_split_rules').find(id);
  if (!rule || rule.owner_id !== ownerId) return { ok: false };
  if (active) {
    const others = (await getSplitRules(ownerId)).filter((r) => r.active && r.id !== id).reduce((n, r) => n + r.pct, 0);
    if (others + rule.pct > 100.0001) return { ok: false, error: 'Turning this on would take the active rules over 100%.' };
  }
  await table<FinanceSplitRule>('finance_split_rules').update(id, { active });
  return { ok: true };
}

/** Removing a rule never touches entries it already posted — that's history. */
export async function removeSplitRule(ownerId: string, id: string): Promise<boolean> {
  const rule = await table<FinanceSplitRule>('finance_split_rules').find(id);
  if (!rule || rule.owner_id !== ownerId) return false;
  await table<FinanceSplitRule>('finance_split_rules').remove(id);
  return true;
}

// ---------------------------------------------------------------------------
// Posting (the hook the invoice flow calls)
// ---------------------------------------------------------------------------

/**
 * Carves each active rule's share out of one freshly-recorded invoice
 * payment and posts it as an expense. Idempotent per (payment, rule): a
 * retry or double-click never doubles up. Only ever applied at the moment a
 * payment is recorded, so a rule created today does not reach back into
 * invoices that were already paid. Returns how many entries were posted.
 */
export async function applySplitsForPayment(ownerId: string, payment: FinanceEntry, invoiceNumber: string | null): Promise<number> {
  if (payment.source !== 'invoice_payment' || payment.type !== 'income') return 0;
  const rules = (await getSplitRules(ownerId)).filter((r) => r.active);
  if (rules.length === 0) return 0;

  const already = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.linked_payment_id === payment.id
  );
  const done = new Set(already.map((e) => e.linked_split_rule_id));

  let posted = 0;
  for (const { rule, amount } of planSplits(payment.amount, rules)) {
    if (done.has(rule.id)) continue;
    await table<FinanceEntry>('finance_entries').insert({
      id: newId(),
      owner_id: ownerId,
      date: payment.date,
      type: 'expense',
      category: splitCategory(rule),
      amount,
      note: `${fmtPct(rule.pct)}% of ${invoiceNumber ? `invoice ${invoiceNumber}` : 'an invoice payment'} → ${rule.label}`,
      source: 'invoice_split',
      created_at: new Date().toISOString(),
      linked_project_id: payment.linked_project_id ?? null,
      linked_invoice_id: payment.linked_invoice_id ?? null,
      linked_payment_id: payment.id,
      linked_split_rule_id: rule.id,
      split_pct: rule.pct,
    });
    posted++;
  }
  return posted;
}

/** The payment was deleted — take its set-asides with it. */
export async function removeSplitsForPayment(ownerId: string, paymentId: string): Promise<void> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.linked_payment_id === paymentId
  );
  for (const e of rows) await table<FinanceEntry>('finance_entries').remove(e.id);
}

/**
 * The payment's amount changed (a TDS correction). Recompute the shares that
 * were already posted, using the % each one was posted at. Deliberately
 * never creates new ones: a rule added after the fact doesn't backfill.
 */
export async function resyncSplitsForPayment(ownerId: string, payment: FinanceEntry): Promise<void> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.linked_payment_id === payment.id
  );
  for (const e of rows) {
    if (e.split_pct == null) continue;
    const amount = splitShare(payment.amount, e.split_pct);
    if (amount <= 0) await table<FinanceEntry>('finance_entries').remove(e.id);
    else if (amount !== e.amount) await table<FinanceEntry>('finance_entries').update(e.id, { amount });
  }
}

/** What was given away via set-asides between two dates (inclusive). */
export async function getSetAsideSummary(ownerId: string, from: string, to: string): Promise<SetAsideSummary> {
  const rows = await table<FinanceEntry>('finance_entries').where(
    (e) => e.owner_id === ownerId && e.source === 'invoice_split' && e.date >= from && e.date <= to
  );
  const prefix = `${FAMILY_CATEGORY_PREFIX} — `;
  const byLabel = new Map<string, number>();
  for (const e of rows) {
    const label = e.category.startsWith(prefix) ? e.category.slice(prefix.length) : e.category;
    byLabel.set(label, (byLabel.get(label) ?? 0) + e.amount);
  }
  return {
    family: r2(rows.reduce((n, e) => n + e.amount, 0)),
    byRecipient: [...byLabel.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

// ---------------------------------------------------------------------------
// Investment log — plain, hand-kept, standalone.
// ---------------------------------------------------------------------------

/** Oldest first, so a row's S.no never changes when a newer one is added. */
export async function getInvestmentLog(ownerId: string): Promise<InvestmentLogEntry[]> {
  const rows = await table<InvestmentLogEntry>('finance_investment_log').where((r) => r.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at.localeCompare(b.created_at)));
}

export async function addInvestmentLogEntry(input: {
  ownerId: string; amount: number; investedIn: string; date: string;
}): Promise<SaveResult> {
  const investedIn = input.investedIn.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!investedIn) return { ok: false, error: 'Say what you invested in.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'Enter the amount invested.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'Pick a date.' };
  const id = newId();
  await table<InvestmentLogEntry>('finance_investment_log').insert({
    id, owner_id: input.ownerId, amount: r2(input.amount), invested_in: investedIn, date: input.date,
    created_at: new Date().toISOString(),
  });
  return { ok: true, id };
}

export async function removeInvestmentLogEntry(ownerId: string, id: string): Promise<boolean> {
  const row = await table<InvestmentLogEntry>('finance_investment_log').find(id);
  if (!row || row.owner_id !== ownerId) return false;
  await table<InvestmentLogEntry>('finance_investment_log').remove(id);
  return true;
}
