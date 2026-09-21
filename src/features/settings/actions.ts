'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings, getTargetsHistory } from './queries';
import type { ClockWidget, WorkspaceSettings, Targets, TargetsVersion } from './types';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/** Upsert — the settings row may not exist yet on a fresh install. */
async function save(ownerId: string, patch: Partial<WorkspaceSettings>): Promise<void> {
  const current = await getSettings(ownerId);
  const existing = await table<WorkspaceSettings>('settings').find(current.id);
  // `targets` on WorkspaceSettings is a computed snapshot (see
  // queries.ts:pickTargets), not a stored field — targets_history is the
  // source of truth, so it's dropped here rather than written back onto
  // the settings row on every unrelated save.
  // `targets` on WorkspaceSettings is a read-time computed snapshot (see
  // queries.ts:pickTargets), not a real stored field — targets_history is
  // the source of truth. Writing it back here is harmless (getSettings
  // recomputes it from history on every read and ignores whatever's on the
  // row), so it's simplest to just carry it along rather than strip it.
  const next: WorkspaceSettings = { ...current, ...patch };

  if (existing) await table<WorkspaceSettings>('settings').update(current.id, next);
  else await table<WorkspaceSettings>('settings').insert(next);

  // The clock strip lives in the shell, so every page's chrome is stale
  // after a change here.
  revalidatePath('/', 'layout');
}

export async function addClock(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const timezone = String(formData.get('timezone') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  if (!timezone || !label) return;

  const { clocks } = await getSettings(owner);
  if (clocks.some((c) => c.timezone === timezone && c.label === label)) return;

  const clock: ClockWidget = {
    id: newId(),
    label,
    timezone,
    home: clocks.length === 0,
  };
  await save(owner, { clocks: [...clocks, clock] });
}

export async function removeClock(id: string): Promise<void> {
  const owner = await requireOwner();
  const { clocks } = await getSettings(owner);
  const next = clocks.filter((c) => c.id !== id);
  // Never leave the strip homeless — promote the first survivor.
  if (next.length > 0 && !next.some((c) => c.home)) next[0]!.home = true;
  await save(owner, { clocks: next });
}

export async function setHomeClock(id: string): Promise<void> {
  const owner = await requireOwner();
  const { clocks } = await getSettings(owner);
  await save(owner, { clocks: clocks.map((c) => ({ ...c, home: c.id === id })) });
}

export async function moveClock(id: string, direction: -1 | 1): Promise<void> {
  const owner = await requireOwner();
  const { clocks } = await getSettings(owner);
  const idx = clocks.findIndex((c) => c.id === id);
  const target = idx + direction;
  const a = clocks[idx];
  const b = clocks[target];
  if (!a || !b) return;

  const next = [...clocks];
  next[idx] = b;
  next[target] = a;
  await save(owner, { clocks: next });
}

/**
 * Add a new targets version, effective from a given date.
 *
 * This never edits a version in place — every save is a new row in
 * `targets_history`, which is what makes "what was my target back in June"
 * answerable later. Saving twice for the *same* date overwrites just that
 * date's version (so fixing a typo doesn't spam the history), but changing
 * the date always creates a new one.
 *
 * Every numeric field floors at 0 and 0 means "not tracking this", which is
 * what lets the Dashboard hide a ring instead of showing a meaningless
 * 0-of-0 progress bar.
 */
export async function addTargetsVersion(formData: FormData): Promise<void> {
  const owner = await requireOwner();

  const effectiveFrom = String(formData.get('effective_from') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return;

  const num = (k: string, max = 1_000_000_000): number => {
    const v = Number(formData.get(k) ?? 0);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(max, v);
  };

  const targets: Targets = {
    weekly_focus_hours: num('weekly_focus_hours', 7 * 24),
    weekly_tasks: num('weekly_tasks', 1000),
    weekly_active_days: Math.min(7, Math.round(num('weekly_active_days', 7))),
    monthly_focus_hours: num('monthly_focus_hours', 31 * 24),
    monthly_tasks: num('monthly_tasks', 5000),
    monthly_revenue: num('monthly_revenue'),
    yearly_revenue: num('yearly_revenue'),
    currency: String(formData.get('currency') ?? '').trim().toUpperCase().slice(0, 4) || 'INR',
    fiscal_year_start_month: Math.min(12, Math.max(1, Math.round(num('fiscal_year_start_month', 12)) || 1)),
  };

  const history = await getTargetsHistory(owner);
  const existing = history.find((v) => v.effective_from === effectiveFrom);

  if (existing) {
    await table<TargetsVersion>('targets_history').update(existing.id, { targets });
  } else {
    await table<TargetsVersion>('targets_history').insert({
      id: newId(),
      owner_id: owner,
      effective_from: effectiveFrom,
      targets,
      created_at: new Date().toISOString(),
    });
  }

  revalidatePath('/dashboard');
  revalidatePath('/settings');
}

export async function deleteTargetsVersion(id: string): Promise<void> {
  await requireOwner();
  await table<TargetsVersion>('targets_history').remove(id);
  revalidatePath('/dashboard');
  revalidatePath('/settings');
}

/** Define a new category for the Dashboard's 24-hour split. */
export async function addCategory(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const label = String(formData.get('label') ?? '').trim();
  const color = String(formData.get('color') ?? '').trim() || '#5F3DEB';
  if (!label) return;

  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `cat-${Date.now()}`;

  const { categories } = await getSettings(owner);
  if (categories.some((c) => c.key === key)) return; // same label already exists

  await save(owner, { categories: [...categories, { key, label, color }] });
}

export async function removeCategory(key: string): Promise<void> {
  const owner = await requireOwner();
  const { categories } = await getSettings(owner);
  await save(owner, { categories: categories.filter((c) => c.key !== key) });
  // Tasks that referenced this category keep their (now-orphaned) tag rather
  // than being silently rewritten; the Dashboard falls back to a generic
  // label for any key it doesn't recognise, so nothing breaks.
}

export async function updateRewardVaultConfig(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const num = (k: string, fallback: number, max: number): number => {
    const v = Number(formData.get(k) ?? fallback);
    return Number.isFinite(v) && v >= 0 ? Math.min(max, v) : fallback;
  };
  await save(owner, {
    reward_vault: {
      cooldown_hours: num('cooldown_hours', 48, 24 * 30),
      expiry_days: Math.round(num('expiry_days', 14, 365)),
      spend_cap_pct: Math.min(1, num('spend_cap_pct', 0.5, 1)),
      course_cap: num('course_cap', 10_000, 10_000_000),
      auto_post_purchases: formData.get('auto_post_purchases') === 'on',
    },
  });
  revalidatePath('/reward-vault');
}

export async function updateBusiness(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const current = await getSettings(owner);
  const str = (k: string) => String(formData.get(k) ?? '').trim();

  await save(owner, {
    business: {
      ...current.business,
      legal_name: str('legal_name'),
      address: str('address'),
      email: str('email'),
      phone: str('phone'),
      tax_id: str('tax_id'),
      payment_details: str('payment_details'),
      default_tax_pct: Math.min(100, Math.max(0, Number(formData.get('default_tax_pct') ?? 0) || 0)),
      invoice_prefix: str('invoice_prefix') || 'INV',
      quote_prefix: str('quote_prefix') || 'QT',
      footer_note: str('footer_note'),
    },
    code_root: str('code_root'),
  });
}
