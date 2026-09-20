'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { todayIso } from '@/lib/tz/today';
import { getSourceSnapshot, getLinkableProjects, getLinkableCourses } from './source';
import { reconcileNeeds, occupiedSourceIds } from './queries';
import { postRewardVaultExpense } from '@/features/daily-finance/actions';
import type { Need, NeedSourceType } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(): string {
  return `need_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate a (source_type, source_id, price) triple against rules 3, 4 and
 * 8, shared by both `addNeed` and `relinkNeed` — the spec is explicit that
 * a relink is "subject to rules 3 and 4 exactly like creating a new Need,
 * no shortcuts on the second attempt", so this is the one place both call
 * through rather than two copies of the same checks drifting apart.
 */
async function validateLink(
  ownerId: string,
  sourceType: NeedSourceType,
  sourceId: string,
  price: number,
  courseCap: number,
  spendCapPct: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const source = await getSourceSnapshot(sourceType, sourceId);
  if (!source || !source.exists) return { ok: false, reason: 'That project or course no longer exists.' };
  // Rule 8: no backdating — only an active source can be (re)linked.
  if (!source.isActive) return { ok: false, reason: `${source.name} is already finished or dropped — no backdating onto an already-earned source.` };

  // Rule 4: one active need per source.
  const needs = await table<Need>('needs').where((n) => n.owner_id === ownerId);
  const occupied = occupiedSourceIds(needs, sourceType);
  if (occupied.has(sourceId)) return { ok: false, reason: `${source.name} already has an active need linked to it.` };

  // Rule 3: spend cap.
  const cap = sourceType === 'course' ? courseCap : (source.capBasis ?? 0) * spendCapPct;
  if (sourceType === 'project' && !source.capBasis) {
    return { ok: false, reason: `${source.name} has no invoice amount to cap against yet — add one, or mark it earned, first.` };
  }
  if (price > cap) return { ok: false, reason: `Exceeds the spend cap — max ${Math.round(cap).toLocaleString('en-IN')} for this source.` };

  return { ok: true };
}

export async function addNeed(formData: FormData): Promise<{ error?: string }> {
  const owner = await requireOwner();
  const settings = await getSettings(owner);

  const name = String(formData.get('name') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const icon = String(formData.get('emoji_icon') ?? '🎁').trim() || '🎁';
  const price = Number(formData.get('price') ?? 0);
  const sourceType = (String(formData.get('source_type') ?? 'project') as NeedSourceType);
  const sourceId = String(formData.get('source_id') ?? '').trim();

  if (!name || !category || !Number.isFinite(price) || price <= 0 || !sourceId) {
    return { error: 'Fill in a name, price and a linked project or course.' };
  }

  const check = await validateLink(owner, sourceType, sourceId, price, settings.reward_vault.course_cap, settings.reward_vault.spend_cap_pct);
  if (!check.ok) return { error: check.reason };

  const source = await getSourceSnapshot(sourceType, sourceId);
  const now = new Date().toISOString();

  await table<Need>('needs').insert({
    id: newId(),
    owner_id: owner,
    name, category, emoji_icon: icon, price,
    source_type: sourceType,
    linked_source_id: sourceId,
    status: 'in_progress',
    progress_pct: source?.progressPct ?? 0,
    unlocked_at: null, cooldown_ends_at: null, purchased_at: null, expires_at: null,
    created_at: now, linked_at: now,
    notify_pending: null,
  });

  revalidatePath('/reward-vault');
  return {};
}

/** Released and expired Needs need an explicit relink — rule 7 — routed
 *  through the exact same validation as a fresh link (rule 3, 4 and 8). */
export async function relinkNeed(needId: string, formData: FormData): Promise<{ error?: string }> {
  const owner = await requireOwner();
  const settings = await getSettings(owner);
  const need = await table<Need>('needs').find(needId);
  if (!need || need.owner_id !== owner) return { error: 'Need not found.' };
  if (need.status !== 'released' && need.status !== 'expired') return { error: 'Only a released or expired need can be relinked.' };

  const sourceType = (String(formData.get('source_type') ?? need.source_type) as NeedSourceType);
  const sourceId = String(formData.get('source_id') ?? '').trim();
  if (!sourceId) return { error: 'Pick a project or course to relink to.' };

  const check = await validateLink(owner, sourceType, sourceId, need.price, settings.reward_vault.course_cap, settings.reward_vault.spend_cap_pct);
  if (!check.ok) return { error: check.reason };

  const source = await getSourceSnapshot(sourceType, sourceId);
  const now = new Date().toISOString();

  await table<Need>('needs').update(needId, {
    source_type: sourceType,
    linked_source_id: sourceId,
    status: 'in_progress',
    progress_pct: source?.progressPct ?? 0,
    unlocked_at: null, cooldown_ends_at: null, expires_at: null,
    linked_at: now,
    notify_pending: null,
  });

  revalidatePath('/reward-vault');
  return {};
}

/**
 * Rule 9: purchased is always its own explicit fact, never inferred.
 * Rule 10: optionally posts to Daily Finance, still user-editable there
 * afterward since correcting a purchase price is a normal fix, not a way
 * to game the gate.
 */
export async function markPurchased(needId: string): Promise<void> {
  const owner = await requireOwner();
  const need = await table<Need>('needs').find(needId);
  if (!need || need.owner_id !== owner || need.status !== 'ready') return;

  const purchasedAt = todayIso();
  await table<Need>('needs').update(needId, { status: 'purchased', purchased_at: purchasedAt });

  const settings = await getSettings(owner);
  if (settings.reward_vault.auto_post_purchases) {
    await postRewardVaultExpense({
      ownerId: owner, date: purchasedAt, amount: need.price, note: need.name, linkedNeedId: needId,
    });
  }

  revalidatePath('/reward-vault');
  revalidatePath('/daily-finance');
  revalidatePath('/dashboard');
}

export async function acknowledgeNotification(needId: string): Promise<void> {
  const owner = await requireOwner();
  const need = await table<Need>('needs').find(needId);
  if (!need || need.owner_id !== owner) return;
  await table<Need>('needs').update(needId, { notify_pending: null });
}

export async function deleteNeed(needId: string): Promise<void> {
  await requireOwner();
  await table<Need>('needs').remove(needId);
  revalidatePath('/reward-vault');
}

/** Data for the "Add a need" / "Relink" form's project and course pickers. */
export async function getLinkOptions(ownerId: string) {
  const needs = await table<Need>('needs').where((n) => n.owner_id === ownerId);
  const [projects, courses] = await Promise.all([
    getLinkableProjects(ownerId, occupiedSourceIds(needs, 'project')),
    getLinkableCourses(ownerId, occupiedSourceIds(needs, 'course')),
  ]);
  return { projects, courses };
}

export { reconcileNeeds };
