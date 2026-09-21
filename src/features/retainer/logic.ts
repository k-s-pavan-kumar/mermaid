import type { Client } from '@/features/clients/types';
import { grandTotal, type Invoice } from '@/features/billing/types';

export type RetainerState = 'received' | 'pending' | 'overdue';

export interface RetainerMonth {
  /** 'YYYY-MM' */
  period: string;
  /** 'September 2026' */
  label: string;
  /** Date the payment is expected by, 'YYYY-MM-DD'. */
  dueDate: string;
  /** What was received if paid, else the agreed monthly fee. */
  amount: number;
  state: RetainerState;
  invoice: Invoice | null;
  /** Date the money arrived (only when received). */
  receivedOn: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

const clampDay = (d: number | null | undefined) => Math.min(28, Math.max(1, Math.round(d ?? 5) || 5));
const pad = (n: number) => String(n).padStart(2, '0');

/** Every 'YYYY-MM' from `start` to `end` inclusive, oldest first. */
export function periodsBetween(start: string, end: string, cap = 60): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number) as [number, number];
  const [ey, em] = end.split('-').map(Number) as [number, number];
  while ((y < ey || (y === ey && m <= em)) && out.length < cap) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * One row per month from the retainer's start month to the current month,
 * newest first. A month is:
 *   received — a paid invoice exists for that period;
 *   overdue  — nothing received and the due date has passed;
 *   pending  — nothing received yet, due date still ahead (or today).
 * Nothing is stored for a month that hasn't been received: "not received" is
 * simply the absence of a paid invoice, so there is no job that has to create
 * rows each month and nothing that can fall out of sync.
 */
export function retainerMonths(
  client: Pick<Client, 'billing_type' | 'monthly_fee' | 'retainer_start' | 'retainer_due_day'>,
  invoices: Pick<Invoice, 'period' | 'status' | 'paid_at' | 'items' | 'amount' | 'tax_pct'>[] & Partial<Invoice>[],
  todayIso: string
): RetainerMonth[] {
  if (client.billing_type !== 'monthly' || !client.retainer_start) return [];

  const start = client.retainer_start.slice(0, 7);
  const current = todayIso.slice(0, 7);
  if (start > current) return [];

  const fee = client.monthly_fee ?? 0;
  const day = clampDay(client.retainer_due_day);
  const byPeriod = new Map<string, Invoice>();
  for (const inv of invoices as Invoice[]) if (inv.period) byPeriod.set(inv.period, inv);

  return periodsBetween(start, current)
    .map((period): RetainerMonth => {
      const inv = byPeriod.get(period) ?? null;
      const dueDate = `${period}-${pad(day)}`;
      const received = inv?.status === 'paid';
      return {
        period,
        label: periodLabel(period),
        dueDate,
        amount: received && inv ? grandTotal(inv) : fee,
        state: received ? 'received' : todayIso > dueDate ? 'overdue' : 'pending',
        invoice: inv,
        receivedOn: received ? inv?.paid_at ?? null : null,
      };
    })
    .reverse();
}

export function retainerSummary(months: RetainerMonth[]) {
  const received = months.filter((m) => m.state === 'received');
  const overdue = months.filter((m) => m.state === 'overdue');
  const pending = months.filter((m) => m.state === 'pending');
  const sum = (ms: RetainerMonth[]) => Math.round(ms.reduce((s, m) => s + m.amount, 0) * 100) / 100;
  return {
    receivedTotal: sum(received),
    overdueTotal: sum(overdue),
    pendingTotal: sum(pending),
    receivedCount: received.length,
    overdueCount: overdue.length,
    pendingCount: pending.length,
  };
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000);
}
