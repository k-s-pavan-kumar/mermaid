'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from './queries';
import type { ClockWidget, WorkspaceSettings } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/** Upsert — the settings row may not exist yet on a fresh install. */
async function save(ownerId: string, patch: Partial<WorkspaceSettings>): Promise<void> {
  const current = await getSettings(ownerId);
  const existing = await table<WorkspaceSettings>('settings').find(current.id);
  const next = { ...current, ...patch };

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
    id: `clk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
 * Save weekly / monthly / yearly targets.
 *
 * Every numeric field floors at 0 and 0 means "not tracking this", which is
 * what lets the Dashboard hide a ring instead of showing a meaningless
 * 0-of-0 progress bar.
 */
export async function updateTargets(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const current = await getSettings(owner);

  const num = (k: string, max = 1_000_000_000): number => {
    const v = Number(formData.get(k) ?? 0);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(max, v);
  };

  await save(owner, {
    targets: {
      ...current.targets,
      weekly_focus_hours: num('weekly_focus_hours', 7 * 24),
      weekly_tasks: num('weekly_tasks', 1000),
      weekly_active_days: Math.min(7, Math.round(num('weekly_active_days', 7))),
      monthly_focus_hours: num('monthly_focus_hours', 31 * 24),
      monthly_tasks: num('monthly_tasks', 5000),
      monthly_revenue: num('monthly_revenue'),
      yearly_revenue: num('yearly_revenue'),
      currency: String(formData.get('currency') ?? '').trim().toUpperCase().slice(0, 4) || 'INR',
      fiscal_year_start_month: Math.min(12, Math.max(1, Math.round(num('fiscal_year_start_month', 12)) || 1)),
    },
  });

  revalidatePath('/dashboard');
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
