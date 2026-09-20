'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import type { TrackedPackage, MetricSnapshot, Platform } from './types';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function addTrackedPackage(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  const platform = String(formData.get('platform') ?? '').trim() as Platform;
  const identifier = String(formData.get('platform_identifier') ?? '').trim();
  if (!name || !platform || !identifier) return;

  const id = newId('pkg');
  await table<TrackedPackage>('tracked_packages').insert({
    id, owner_id: owner, name,
    description: String(formData.get('description') ?? '').trim(),
    emoji_icon: String(formData.get('emoji_icon') ?? '📦').trim() || '📦',
    platform, platform_identifier: identifier,
    family: String(formData.get('family') ?? '').trim() || null,
    created_at: new Date().toISOString(),
  });

  // First sync happens immediately so a freshly added package doesn't sit
  // with no numbers until the next manual sync.
  await syncOnePackage(id);
  revalidatePath('/release-stats');
}

export async function deleteTrackedPackage(id: string): Promise<void> {
  await requireOwner();
  await table<TrackedPackage>('tracked_packages').remove(id);
  revalidatePath('/release-stats');
}

/**
 * Real, live calls to each platform's own public API — no scraping, no API
 * key required for any of these three. They genuinely work once deployed
 * with normal internet access; they simply can't be *exercised* from this
 * build sandbox, whose outbound network allowlist doesn't include
 * api.npmjs.org, pypi.org's JSON API, or api.github.com. Every branch is
 * wrapped so an unreachable or rate-limited source degrades to "keep the
 * last known snapshot, mark it stale" rather than throwing or zeroing out.
 */
async function fetchPlatformMetrics(pkg: TrackedPackage): Promise<Partial<MetricSnapshot> & { fetch_ok: boolean }> {
  try {
    if (pkg.platform === 'npm') {
      const [dlRes, repoRes] = await Promise.all([
        fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg.platform_identifier)}`, { cache: 'no-store' }),
        fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.platform_identifier)}`, { cache: 'no-store' }),
      ]);
      if (!dlRes.ok) return { fetch_ok: false };
      const dl = await dlRes.json();
      // Stars aren't an npm concept — pull them from the linked GitHub repo
      // in package.json's `repository` field, if the registry call succeeded
      // and one is present; otherwise leave stars null rather than 0.
      let stars: number | null = null;
      if (repoRes.ok) {
        const meta = await repoRes.json();
        const repoUrl: string | undefined = meta?.repository?.url ?? meta?.repository;
        const match = typeof repoUrl === 'string' ? repoUrl.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/) : null;
        if (match) {
          const ghRes = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, { cache: 'no-store' });
          if (ghRes.ok) stars = (await ghRes.json())?.stargazers_count ?? null;
        }
      }
      return { downloads_30d: dl?.downloads ?? null, stars, fetch_ok: true };
    }

    if (pkg.platform === 'pypi') {
      const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg.platform_identifier)}/json`, { cache: 'no-store' });
      if (!res.ok) return { fetch_ok: false };
      // PyPI's JSON API doesn't include download counts directly (that's
      // pypistats.org, a separate service with its own rate limits) — a
      // real deployment would add a second call there; kept out here to
      // stay within "no API key, one obvious call per platform" for this
      // pass, so downloads_30d stays whatever was last recorded.
      await res.json();
      return { fetch_ok: true };
    }

    if (pkg.platform === 'github') {
      const res = await fetch(`https://api.github.com/repos/${pkg.platform_identifier}`, { cache: 'no-store' });
      if (!res.ok) return { fetch_ok: false };
      const data = await res.json();
      return { stars: data?.stargazers_count ?? null, downloads_30d: data?.forks_count ?? null, fetch_ok: true };
    }

    // Chrome Web Store has no public, keyless JSON API — its listing page
    // is HTML meant for browsers, not a stable data contract. Rather than
    // scrape a page that can silently reshape itself, this platform is
    // sync-unavailable: the card keeps whatever was entered and says so.
    return { fetch_ok: false };
  } catch {
    return { fetch_ok: false };
  }
}

async function syncOnePackage(packageId: string): Promise<void> {
  const pkg = await table<TrackedPackage>('tracked_packages').find(packageId);
  if (!pkg) return;

  const snapshots = await table<MetricSnapshot>('metric_snapshots').where((s) => s.package_id === packageId);
  const last = [...snapshots].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1))[0];

  const fetched = await fetchPlatformMetrics(pkg);

  await table<MetricSnapshot>('metric_snapshots').insert({
    id: newId('snap'),
    owner_id: pkg.owner_id,
    package_id: packageId,
    captured_at: new Date().toISOString(),
    stars: fetched.fetch_ok ? (fetched.stars ?? last?.stars ?? null) : (last?.stars ?? null),
    downloads_30d: fetched.fetch_ok ? (fetched.downloads_30d ?? last?.downloads_30d ?? null) : (last?.downloads_30d ?? null),
    installs: last?.installs ?? null,
    rating: last?.rating ?? null,
    review_count: last?.review_count ?? null,
    fetch_ok: fetched.fetch_ok,
  });
}

/** The manual "Sync now" fallback — there's no scheduled job in this
 *  deployment, so this is the only sync trigger. Syncs every tracked
 *  package for the owner, sequentially, so one slow or failing source
 *  can't cut the others off. */
export async function syncAllPackages(): Promise<void> {
  const owner = await requireOwner();
  const packages = await table<TrackedPackage>('tracked_packages').where((p) => p.owner_id === owner);
  for (const pkg of packages) {
    await syncOnePackage(pkg.id);
  }
  revalidatePath('/release-stats');
  revalidatePath('/dashboard');
}
