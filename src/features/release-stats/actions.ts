'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { PLATFORM_META, PLATFORMS, type TrackedPackage, type MetricSnapshot, type Platform, type ManualField } from './types';
import { fetchPlatformMetrics, normalizeRepo } from './fetchers';
import { getSummary, type AnalyticsSummary } from './analytics/store';
import { newId } from '@/lib/id';

export interface ActionResult { ok: boolean; message: string; detail?: string }
export interface SyncResult { total: number; synced: number; skipped: number; failed: { name: string; error: string }[] }
export interface SdkStatus {
  key: string | null;
  summary: AnalyticsSummary | null;
  last_event_at: string | null;
}

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

/** Owner-checked fetch so one user can never touch another's package. */
async function ownedPackage(id: string, owner: string): Promise<TrackedPackage | null> {
  const pkg = await table<TrackedPackage>('tracked_packages').find(id);
  return pkg && pkg.owner_id === owner ? pkg : null;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(/[, ]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Public, write-only token — safe to ship inside a plugin/extension bundle,
 *  and rotatable if it leaks. 18 random bytes → 24 url-safe chars. */
const newIngestKey = (): string => `mk_${randomBytes(18).toString('base64url')}`;

async function latestSnapshot(packageId: string): Promise<MetricSnapshot | undefined> {
  const snaps = await table<MetricSnapshot>('metric_snapshots').where((s) => s.package_id === packageId);
  return [...snaps].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1))[0];
}

/** Every snapshot starts as a copy of the last one, so a sync that only knows
 *  stars never wipes hand-entered installs, SDK opens or MRR. */
function baseSnapshot(pkg: TrackedPackage, last: MetricSnapshot | undefined): MetricSnapshot {
  return {
    id: newId('snap'), owner_id: pkg.owner_id, package_id: pkg.id, captured_at: new Date().toISOString(),
    stars: last?.stars ?? null, downloads_30d: last?.downloads_30d ?? null, installs: last?.installs ?? null,
    rating: last?.rating ?? null, review_count: last?.review_count ?? null,
    users: last?.users ?? null, mrr: last?.mrr ?? null,
    opens_30d: last?.opens_30d ?? null, return_rate: last?.return_rate ?? null,
    source: last?.source ?? 'manual', fetch_ok: true, fetch_error: null,
  };
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

  const snap = baseSnapshot(pkg, await latestSnapshot(pkg.id));
  snap.installs = entered.installs ?? snap.installs;
  snap.rating = entered.rating ?? snap.rating;
  snap.review_count = entered.review_count ?? snap.review_count;
  snap.users = entered.users ?? snap.users;
  snap.mrr = entered.mrr ?? snap.mrr;
  snap.source = 'manual';
  await table<MetricSnapshot>('metric_snapshots').insert(snap);
}

export async function addTrackedPackage(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  const platform = String(formData.get('platform') ?? '').trim() as Platform;
  if (!name) return { ok: false, message: 'Give it a name first' };
  if (!PLATFORMS.includes(platform)) return { ok: false, message: 'Pick a platform' };

  const meta = PLATFORM_META[platform];
  let identifier = String(formData.get('platform_identifier') ?? '').trim();
  if (platform === 'github') identifier = normalizeRepo(identifier) ?? identifier;
  // Only registries/APIs need an identifier; manual platforms keep it as an optional link.
  if (meta.auto && !identifier) return { ok: false, message: `${meta.identifierLabel} is required for ${meta.label}` };

  const id = newId('pkg');
  const pkg: TrackedPackage = {
    id, owner_id: owner, name,
    description: String(formData.get('description') ?? '').trim(),
    emoji_icon: String(formData.get('emoji_icon') ?? '').trim() || (platform === 'saas' ? '🚀' : '📦'),
    platform, platform_identifier: identifier,
    github_repo: normalizeRepo(String(formData.get('github_repo') ?? '')),
    ingest_key: meta.sdk ? newIngestKey() : null,
    last_event_at: null,
    family: String(formData.get('family') ?? '').trim() || null,
    created_at: new Date().toISOString(),
  };
  await table<TrackedPackage>('tracked_packages').insert(pkg);

  await recordManualSnapshot(pkg, formData);
  // First sync happens immediately so a new package doesn't sit empty.
  const sync = await syncOnePackage(id);
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');

  if (sync.error) return { ok: true, message: `Added ${name}, but the first sync failed`, detail: sync.error };
  return {
    ok: true,
    message: `Added ${name}`,
    detail: meta.sdk ? 'Open “SDK setup” on the card to connect it.' : undefined,
  };
}

/** Fix a wrong identifier, link a GitHub repo, or update hand-entered numbers. */
export async function updateTrackedPackage(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  const existing = await ownedPackage(String(formData.get('id') ?? ''), owner);
  if (!existing) return { ok: false, message: 'That product no longer exists' };

  let identifier = String(formData.get('platform_identifier') ?? existing.platform_identifier).trim();
  if (existing.platform === 'github') identifier = normalizeRepo(identifier) ?? identifier;
  if (PLATFORM_META[existing.platform].auto && !identifier) return { ok: false, message: 'An identifier is required' };

  const patch: Partial<TrackedPackage> = {
    name: String(formData.get('name') ?? existing.name).trim() || existing.name,
    description: String(formData.get('description') ?? existing.description).trim(),
    platform_identifier: identifier,
    github_repo: normalizeRepo(String(formData.get('github_repo') ?? '')),
  };
  const updated = (await table<TrackedPackage>('tracked_packages').update(existing.id, patch)) ?? { ...existing, ...patch };

  await recordManualSnapshot(updated, formData);
  const sync = await syncOnePackage(existing.id);
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
  return sync.error
    ? { ok: true, message: `Saved ${updated.name}, but the sync failed`, detail: sync.error }
    : { ok: true, message: `Saved ${updated.name}` };
}

export async function deleteTrackedPackage(id: string): Promise<void> {
  const owner = await requireOwner();
  if (!(await ownedPackage(id, owner))) return;
  await table<TrackedPackage>('tracked_packages').remove(id);
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
}

// ───────────────────────── SDK ─────────────────────────

/** Used by the setup modal: returns the key (creating one if this product
 *  predates the SDK) and live numbers. Polled while the modal is open so the
 *  user can watch their first event arrive. */
export async function getSdkStatus(id: string, createKey = false): Promise<SdkStatus> {
  const owner = await requireOwner();
  let pkg = await ownedPackage(id, owner);
  if (!pkg || !PLATFORM_META[pkg.platform].sdk) throw new Error('This product does not support the SDK');

  if (!pkg.ingest_key && createKey) {
    pkg = (await table<TrackedPackage>('tracked_packages').update(id, { ingest_key: newIngestKey() })) ?? pkg;
    revalidatePath('/release-stats');
  }
  if (!pkg.ingest_key) return { key: null, summary: null, last_event_at: null };
  return { key: pkg.ingest_key, summary: await getSummary(pkg), last_event_at: pkg.last_event_at };
}

/** Old key stops working immediately; the SDK in shipped builds will get
 *  401s until you release a build with the new one. */
export async function rotateIngestKey(id: string): Promise<ActionResult & { key?: string }> {
  const owner = await requireOwner();
  const pkg = await ownedPackage(id, owner);
  if (!pkg || !PLATFORM_META[pkg.platform].sdk) return { ok: false, message: 'This product does not support the SDK' };
  const key = newIngestKey();
  await table<TrackedPackage>('tracked_packages').update(id, { ingest_key: key });
  revalidatePath('/release-stats');
  return { ok: true, message: 'New ingest key generated', detail: 'The old key stopped working — update the key in your plugin/extension.', key };
}

// ───────────────────────── sync ─────────────────────────

interface OneSync { synced: boolean; error?: string }

/**
 * Real calls to each platform's public API (fetchers.ts) plus, for products
 * with the SDK enabled, a rollup of the events they sent us. A failing
 * source keeps the last known numbers, marks the snapshot stale, and records
 * WHY on it. Manual platforms with nothing to pull are skipped, so "Sync now"
 * never overwrites hand-entered numbers.
 */
async function syncOnePackage(packageId: string): Promise<OneSync> {
  const pkg = await table<TrackedPackage>('tracked_packages').find(packageId);
  if (!pkg) return { synced: false };

  const fetched = await fetchPlatformMetrics(pkg);
  const live = pkg.ingest_key ? await getSummary(pkg) : null;
  if (!fetched && !live) return { synced: false };

  const snap = baseSnapshot(pkg, await latestSnapshot(packageId));
  if (fetched?.ok) {
    snap.stars = fetched.stars ?? snap.stars;
    snap.downloads_30d = fetched.downloads_30d ?? snap.downloads_30d;
    snap.installs = fetched.installs ?? snap.installs;
    snap.rating = fetched.rating ?? snap.rating;
    snap.review_count = fetched.review_count ?? snap.review_count;
  }
  // Only take SDK numbers once events exist, so an un-wired SDK doesn't blank
  // hand-entered store numbers with zeros.
  if (live && live.events > 0) {
    snap.users = live.active_users;
    snap.opens_30d = live.opens;
    snap.return_rate = live.return_rate;
    snap.source = 'sdk';
  } else if (fetched) {
    snap.source = PLATFORM_META[pkg.platform].auto ? 'auto' : snap.source;
  }
  snap.fetch_ok = fetched ? fetched.ok : true;
  snap.fetch_error = fetched ? (fetched.ok ? (fetched.note ?? null) : (fetched.error ?? 'Sync failed')) : null;

  await table<MetricSnapshot>('metric_snapshots').insert(snap);
  return { synced: snap.fetch_ok, error: snap.fetch_ok ? undefined : (snap.fetch_error ?? 'Sync failed') };
}

/** The manual "Sync now" — there's no scheduled job in this deployment.
 *  Runs in small parallel batches so one slow source can't hold the rest up,
 *  and returns a per-product report so the UI can say exactly what happened. */
export async function syncAllPackages(): Promise<SyncResult> {
  const owner = await requireOwner();
  const packages = await table<TrackedPackage>('tracked_packages').where((p) => p.owner_id === owner);
  const result: SyncResult = { total: packages.length, synced: 0, skipped: 0, failed: [] };

  for (let i = 0; i < packages.length; i += 4) {
    const batch = packages.slice(i, i + 4);
    const settled = await Promise.allSettled(batch.map((p) => syncOnePackage(p.id)));
    settled.forEach((s, j) => {
      const name = batch[j]?.name ?? 'Unknown';
      if (s.status === 'rejected') result.failed.push({ name, error: s.reason instanceof Error ? s.reason.message : 'sync crashed' });
      else if (s.value.error) result.failed.push({ name, error: s.value.error });
      else if (s.value.synced) result.synced++;
      else result.skipped++;
    });
  }
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
  return result;
}
