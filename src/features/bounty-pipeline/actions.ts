'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { todayIso } from '@/lib/tz/today';
import { postIncomeEntry } from '@/features/daily-finance/actions';
import type { BountyCase, BountySeverity } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(): string {
  return `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Always lands in `submitted` — every case starts here. */
export async function logSubmission(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const title = String(formData.get('title') ?? '').trim();
  const program_name = String(formData.get('program_name') ?? '').trim();
  if (!title || !program_name) return;

  const estimate = Number(formData.get('estimated_payout') ?? 0);

  await table<BountyCase>('bounty_cases').insert({
    id: newId(),
    owner_id: owner,
    title,
    program_name,
    severity: (String(formData.get('severity') ?? 'medium').toLowerCase() as BountySeverity),
    status: 'submitted',
    currency: 'INR',
    estimated_payout: estimate > 0 ? estimate : null,
    confirmed_payout: null,
    paid_amount: null,
    submitted_at: todayIso(),
    triaged_at: null,
    accepted_at: null,
    paid_at: null,
    created_at: new Date().toISOString(),
  });

  revalidatePath('/bounty-pipeline');
  revalidatePath('/dashboard');
}

/**
 * The only ways `status` changes. Each move sets its timestamp and (where
 * relevant) its authoritative payout figure together, in one action — never
 * as separately editable fields — so a card's date and figure always land
 * in the same step the skill describes.
 */
export async function moveToTriaged(id: string): Promise<void> {
  await requireOwner();
  await table<BountyCase>('bounty_cases').update(id, { status: 'triaged', triaged_at: todayIso() });
  revalidatePath('/bounty-pipeline');
}

export async function moveToAccepted(id: string, formData: FormData): Promise<void> {
  await requireOwner();
  const confirmed = Number(formData.get('confirmed_payout') ?? 0);
  if (!Number.isFinite(confirmed) || confirmed < 0) return;
  await table<BountyCase>('bounty_cases').update(id, {
    status: 'accepted', accepted_at: todayIso(), confirmed_payout: confirmed,
  });
  revalidatePath('/bounty-pipeline');
}

/**
 * The Daily Finance integration point: the instant a case reaches `paid`,
 * post exactly one income FinanceEntry, category "Bug bounty". Defaults the
 * paid amount to whatever was confirmed, but takes its own field since a
 * program can pay a different final number.
 */
export async function moveToPaid(id: string, formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const kase = await table<BountyCase>('bounty_cases').find(id);
  if (!kase) return;

  const raw = String(formData.get('paid_amount') ?? '').trim();
  const paidAmount = raw ? Number(raw) : (kase.confirmed_payout ?? 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) return;

  const paidAt = todayIso();
  await table<BountyCase>('bounty_cases').update(id, { status: 'paid', paid_at: paidAt, paid_amount: paidAmount });

  await postIncomeEntry({
    ownerId: owner,
    date: paidAt,
    category: 'Bug bounty',
    amount: paidAmount,
    note: kase.title,
    source: 'bounty_payout',
    linkedBountyId: id,
  });

  revalidatePath('/bounty-pipeline');
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

/** A program downgrading or rejecting after triage is a legitimate backward
 *  move, not an error state — the columns aren't a one-way gate. */
export async function moveBack(id: string, to: 'submitted' | 'triaged'): Promise<void> {
  await requireOwner();
  const patch: Partial<BountyCase> = { status: to };
  if (to === 'submitted') { patch.triaged_at = null; }
  await table<BountyCase>('bounty_cases').update(id, patch);
  revalidatePath('/bounty-pipeline');
}

export async function markRejectedOrDuplicate(id: string, status: 'rejected' | 'duplicate'): Promise<void> {
  await requireOwner();
  await table<BountyCase>('bounty_cases').update(id, { status });
  revalidatePath('/bounty-pipeline');
}

export async function deleteBountyCase(id: string): Promise<void> {
  await requireOwner();
  await table<BountyCase>('bounty_cases').remove(id);
  revalidatePath('/bounty-pipeline');
}
