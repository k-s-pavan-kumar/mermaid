'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { todayIso } from '@/lib/tz/today';
import { newId } from '@/lib/id';
import { grandTotal, type Invoice } from '@/features/billing/types';
import type { Client } from '@/features/clients/types';
import type { FinanceEntry } from '@/features/daily-finance/types';
import { postIncomeEntry } from '@/features/daily-finance/actions';
import { periodLabel } from './logic';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function nextInvoiceNumber(prefix: string, rows: { number: string }[]): string {
  const stem = `${prefix}-${todayIso().slice(0, 4)}-`;
  const highest = rows
    .map((r) => r.number)
    .filter((n) => n.startsWith(stem))
    .map((n) => Number(n.slice(stem.length)) || 0)
    .reduce((max, n) => Math.max(max, n), 0);
  return `${stem}${String(highest + 1).padStart(3, '0')}`;
}

/**
 * "We received September's payment." Records it as a PAID invoice for that
 * month (one per client per month), which is what makes it show up
 * everywhere money already shows up — the client's Collected total, the
 * Dashboard revenue, and the Daily Finance ledger — without a second system
 * to keep in step. Safe to click twice: the month already has its invoice.
 */
export async function markRetainerReceived(clientId: string, period: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  if (!PERIOD.test(period)) return;

  const client = await table<Client>('clients').find(clientId);
  if (!client || client.owner_id !== owner || client.billing_type !== 'monthly') return;

  const receivedRaw = String(formData.get('received_on') ?? '').trim();
  const receivedOn = DATE.test(receivedRaw) ? receivedRaw : todayIso();
  const amountRaw = Number(formData.get('amount') ?? 0);
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : client.monthly_fee ?? 0;
  if (amount <= 0) return;

  const existing = await table<Invoice>('invoices').where((i) => i.client_id === clientId && i.period === period);
  let inv = existing[0];

  if (inv) {
    inv = (await table<Invoice>('invoices').update(inv.id, {
      status: 'paid',
      paid_at: receivedOn,
      amount,
      tax_pct: 0,
      items: [{ description: `Monthly retainer — ${periodLabel(period)}`, qty: 1, rate: amount, unit: 'month' }],
    })) ?? inv;
  } else {
    const settings = await getSettings(owner);
    const all = await table<Invoice>('invoices').all();
    inv = await table<Invoice>('invoices').insert({
      id: newId(),
      owner_id: owner,
      project_id: null,
      client_id: clientId,
      stream: 'freelance',
      number: nextInvoiceNumber(settings.business.invoice_prefix, all),
      description: `Monthly retainer — ${periodLabel(period)}`,
      items: [{ description: `Monthly retainer — ${periodLabel(period)}`, qty: 1, rate: amount, unit: 'month' }],
      amount,
      tax_pct: 0, // received amount is the amount; raise a normal invoice if GST applies
      currency: 'INR',
      notes: null,
      quote_id: null,
      period,
      status: 'paid',
      issued_at: `${period}-01`,
      due_at: null,
      paid_at: receivedOn,
      tds_amount: 0,
    });
  }

  await postIncomeEntry({
    ownerId: owner,
    date: receivedOn,
    category: 'Client payment',
    amount: grandTotal(inv),
    note: `${client.name} — monthly retainer ${periodLabel(period)}`,
    source: 'invoice_payment',
    linkedProjectId: null,
    linkedInvoiceId: inv.id,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/clients');
  revalidatePath('/billing');
  revalidatePath('/dashboard');
  revalidatePath('/daily-finance');
  revalidatePath('/notifications');
}

/**
 * Marked received by mistake. Removes that month's retainer invoice and the
 * ledger income it produced, putting the month back to pending/overdue.
 * Only ever touches an invoice made by the retainer flow (it carries the
 * period); ordinary invoices are never deleted here.
 */
export async function undoRetainerReceived(clientId: string, period: string): Promise<void> {
  const owner = await requireOwner();
  if (!PERIOD.test(period)) return;

  const client = await table<Client>('clients').find(clientId);
  if (!client || client.owner_id !== owner) return;

  const invoices = await table<Invoice>('invoices').where((i) => i.client_id === clientId && i.period === period);
  for (const inv of invoices) {
    const entries = await table<FinanceEntry>('finance_entries').where((e) => e.linked_invoice_id === inv.id);
    for (const e of entries) await table<FinanceEntry>('finance_entries').remove(e.id);
    await table<Invoice>('invoices').remove(inv.id);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/clients');
  revalidatePath('/billing');
  revalidatePath('/dashboard');
  revalidatePath('/daily-finance');
  revalidatePath('/notifications');
}
