import { table } from '@/lib/data';
import { todayIso } from '@/lib/tz/today';
import type { BountyCase } from './types';

export async function getBountyCases(ownerId: string): Promise<BountyCase[]> {
  const rows = await table<BountyCase>('bounty_cases').where((c) => c.owner_id === ownerId);
  return [...rows].sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
}

export interface BountyStats {
  open: number; // submitted + triaged
  acceptedThisYear: number;
  paidYtd: number;
  pendingPayoutEstimate: number; // sum of confirmed_payout for everything in 'accepted'
  currency: string;
}

export async function getBountyStats(ownerId: string): Promise<BountyStats> {
  const cases = await getBountyCases(ownerId);
  const year = todayIso().slice(0, 4);
  const currency = cases[0]?.currency ?? 'INR';

  return {
    open: cases.filter((c) => c.status === 'submitted' || c.status === 'triaged').length,
    acceptedThisYear: cases.filter((c) => (c.accepted_at ?? '').startsWith(year) && (c.status === 'accepted' || c.status === 'paid')).length,
    paidYtd: cases.filter((c) => c.status === 'paid' && (c.paid_at ?? '').startsWith(year)).reduce((n, c) => n + (c.paid_amount ?? 0), 0),
    pendingPayoutEstimate: cases.filter((c) => c.status === 'accepted').reduce((n, c) => n + (c.confirmed_payout ?? 0), 0),
    currency,
  };
}
