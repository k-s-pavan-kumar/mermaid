'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { PLATFORM_META, PLATFORMS, type TrackedPackage, type MetricSnapshot, type Platform, type ManualField } from './types';
import { fetchPlatformMetrics, normalizeRepo } from './fetchers';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(/[, ]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function latestSnapshot(packageId: string): Promise<MetricSnapshot | undefined> {
  const snaps = await table<MetricSnapshot>('metric_snapshots').where((s) => s.package_id === packageId);
  return [...snaps].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1))[0];
}

/** Records hand-entered numbers (Figma, Snapchat, Chrome Web Store, SaaS).
 *  Fields left blank keep their last value, so you can update just MRR. */
async function recordManualSnapshot(pkg: TrackedPackage, fd: FormData): Promise<void> {
  const fields = PLATFORM_META[pkg.platform].manualFields;
  if (fields.length === 0) return;
  const entered: Partial<Record<ManualField, number | null>> = {};
  let any = false;
  for (const f of fields) {
    const v = numOrNull(fd.get(f));
    if (v !== null) any = true;
    entered[f] = v;
  }
  if (!any) return;

  const last = await latestSnapshot(pkg.id);
  await table<MetricSnapshot>('metric_snapshots').insert({
    id: newId('snap'),
    owner_id: pkg.owner_id,
    package_id: pkg.id,
    captured_at: new Date().toISOString(),
    stars: last?.stars ?? null,
    downloads_30d: last?.downloads_30d ?? null,
    installs: entered.installs ?? last?.installs ?? null,
    rating: entered.rating ?? last?.rating ?? null,
    review_count: entered.review_count ?? last?.review_count ?? null,
    users: entered.users ?? last?.users ?? null,
    mrr: entered.mrr ?? last?.mrr ?? null,
    source: 'manual',
    fetch_ok: true,
    fetch_error: null,
  });
}

export async function addTrackedPackage(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  const platform = String(formData.get('platform') ?? '').trim() as Platform;
  if (!name || !PLATFORMS.includes(platform)) return;

  const meta = PLATFORM_META[platform];
  let identifier = String(formData.get('platform_identifier') ?? '').trim();
  if (platform === 'github') identifier = normalizeRepo(identifier) ?? identifier;
  // Only registries/APIs need an identifier; manual platforms keep it as an optional link.
  if (meta.auto && !identifier) return;

  const id = newId('pkg');
  const pkg: TrackedPackage = {
    id, owner_id: owner, name,
    description: String(formData.get('description') ?? '').trim(),
    emoji_icon: String(formData.get('emoji_icon') ?? '').trim() || (platform === 'saas' ? '🚀' : '📦'),
    platform, platform_identifier: identifier,
    github_repo: normalizeRepo(String(formData.get('github_repo') ?? '')),
    family: String(formData.get('family') ?? '').trim() || null,
    created_at: new Date().toISOString(),
  };
  await table<TrackedPackage>('tracked_packages').insert(pkg);

  await recordManualSnapshot(pkg, formData);
  // First sync happens immediately so a new package doesn't sit empty.
  await syncOnePackage(id);
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
}

/** Fix a wrong identifier, link a GitHub repo, or update hand-entered numbers. */
export async function updateTrackedPackage(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get('id') ?? '');
  const existing = await table<TrackedPackage>('tracked_packages').find(id);
  if (!existing || existing.owner_id !== owner) return;

  let identifier = String(formData.get('platform_identifier') ?? existing.platform_identifier).trim();
  if (existing.platform === 'github') identifier = normalizeRepo(identifier) ?? identifier;
  if (PLATFORM_META[existing.platform].auto && !identifier) return;

  const patch: Partial<TrackedPackage> = {
    name: String(formData.get('name') ?? existing.name).trim() || existing.name,
    description: String(formData.get('description') ?? existing.description).trim(),
    platform_identifier: identifier,
    github_repo: normalizeRepo(String(formData.get('github_repo') ?? '')),
  };
  const updated = (await table<TrackedPackage>('tracked_packages').update(id, patch)) ?? { ...existing, ...patch };

  await recordManualSnapshot(updated, formData);
  await syncOnePackage(id);
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
}

export async function deleteTrackedPackage(id: string): Promise<void> {
  await requireOwner();
  await table<TrackedPackage>('tracked_packages').remove(id);
  revalidatePath('/release-stats');
}

/**
 * Real calls to each platform's public API (see fetchers.ts). A failing
 * source keeps the last known snapshot, marks it stale, and records WHY on
 * the snapshot so the card can show it. Manual platforms with no linked
 * GitHub repo have nothing to sync and are skipped, so "Sync now" never
 * overwrites hand-entered numbers.
 */
async function syncOnePackage(packageId: string): Promise<void> {
  const pkg = await table<TrackedPackage>('tracked_packages').find(packageId);
  if (!pkg) return;

  const fetched = await fetchPlatformMetrics(pkg);
  if (!fetched) return;

  const last = await latestSnapshot(packageId);
  const pick = <K extends 'stars' | 'downloads_30d' | 'installs' | 'rating' | 'review_count'>(k: K): number | null =>
    fetched.ok ? (fetched[k] ?? last?.[k] ?? null) : (last?.[k] ?? null);

  await table<MetricSnapshot>('metric_snapshots').insert({
    id: newId('snap'),
    owner_id: pkg.owner_id,
    package_id: packageId,
    captured_at: new Date().toISOString(),
    stars: pick('stars'),
    downloads_30d: pick('downloads_30d'),
    installs: pick('installs'),
    rating: pick('rating'),
    review_count: pick('review_count'),
    users: last?.users ?? null,
    mrr: last?.mrr ?? null,
    source: PLATFORM_META[pkg.platform].auto ? 'auto' : 'manual',
    fetch_ok: fetched.ok,
    fetch_error: fetched.ok ? (fetched.note ?? null) : (fetched.error ?? 'Sync failed'),
  });
}

/** The manual "Sync now" — there's no scheduled job in this deployment.
 *  Syncs every package in parallel batches so one slow source can't hold
 *  the rest up, and one failure can't cut the others off. */
export async function syncAllPackages(): Promise<void> {
  const owner = await requireOwner();
  const packages = await table<TrackedPackage>('tracked_packages').where((p) => p.owner_id === owner);
  for (let i = 0; i < packages.length; i += 4) {
    await Promise.allSettled(packages.slice(i, i + 4).map((p) => syncOnePackage(p.id)));
  }
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
}
