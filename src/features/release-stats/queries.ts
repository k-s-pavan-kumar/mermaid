import { table } from '@/lib/data';
import type { TrackedPackage, MetricSnapshot } from './types';
import { getSummary, type AnalyticsSummary } from './analytics/store';

export interface PackageWithMetrics {
  pkg: TrackedPackage;
  /** Live SDK numbers (null when the SDK isn't enabled for this product). */
  sdk: AnalyticsSummary | null;
  latest: MetricSnapshot | null;
  previous: MetricSnapshot | null; // for the week-over-week delta
  history: MetricSnapshot[]; // last 7, oldest first — for the sparkline
}

function blankSnapshot(pkg: TrackedPackage): MetricSnapshot {
  return {
    id: `live_${pkg.id}`, owner_id: pkg.owner_id, package_id: pkg.id, captured_at: new Date().toISOString(),
    stars: null, downloads_30d: null, installs: null, rating: null, review_count: null, users: null, mrr: null,
    opens_30d: null, return_rate: null, source: 'sdk', fetch_ok: true, fetch_error: null,
  };
}

export async function getPackagesWithMetrics(ownerId: string): Promise<PackageWithMetrics[]> {
  const packages = await table<TrackedPackage>('tracked_packages').where((p) => p.owner_id === ownerId);
  const out: PackageWithMetrics[] = [];

  for (const pkg of packages) {
    const snapshots = await table<MetricSnapshot>('metric_snapshots').where((s) => s.package_id === pkg.id);
    const sorted = [...snapshots].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));
    // SDK numbers are read live so they're current on every page load, not
    // only after "Sync now". A failing read must not take the page down.
    let sdk: AnalyticsSummary | null = null;
    if (pkg.ingest_key) { try { sdk = await getSummary(pkg); } catch { sdk = null; } }
    const base = sorted[0] ?? null;
    const latest: MetricSnapshot | null = sdk && sdk.events > 0
      ? {
          ...(base ?? blankSnapshot(pkg)),
          users: sdk.active_users, opens_30d: sdk.opens, return_rate: sdk.return_rate, source: 'sdk',
        }
      : base;
    out.push({
      pkg,
      sdk,
      latest,
      previous: sorted.find((s) => Date.parse(sorted[0]?.captured_at ?? '') - Date.parse(s.captured_at) >= 6 * 86_400_000) ?? null,
      history: sorted.slice(0, 7).reverse(),
    });
  }

  return out;
}

/** Grouped by family for the "Syntheui: 4 packages" rollup row; a package
 *  with no family is its own group of one. */
export function groupByFamily(rows: PackageWithMetrics[]): { family: string; rows: PackageWithMetrics[] }[] {
  const groups = new Map<string, PackageWithMetrics[]>();
  for (const r of rows) {
    const key = r.pkg.family ?? r.pkg.name;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([family, rs]) => ({ family, rows: rs }));
}

export interface ReleaseStatsSummary {
  totalMrr: number;
  totalUsers: number;
  hasSaas: boolean;
  totalStars: number;
  starsDeltaWeek: number;
  totalDownloads: number;
  downloadsDeltaWeek: number;
  packagesTracked: number;
}

export function summarize(rows: PackageWithMetrics[]): ReleaseStatsSummary {
  let totalStars = 0, starsDeltaWeek = 0, totalDownloads = 0, downloadsDeltaWeek = 0, totalMrr = 0, totalUsers = 0;
  for (const r of rows) {
    // SaaS products report users + MRR; they don't add to "downloads/installs".
    totalMrr += r.latest?.mrr ?? 0;
    totalUsers += r.latest?.users ?? 0;
    const isSaas = r.pkg.platform === 'saas';
    const stars = r.latest?.stars ?? 0;
    const dls = isSaas ? 0 : (r.latest?.downloads_30d ?? 0) + (r.latest?.installs ?? 0);
    totalStars += stars;
    totalDownloads += dls;
    if (r.previous) {
      starsDeltaWeek += stars - (r.previous.stars ?? 0);
      downloadsDeltaWeek += dls - (isSaas ? 0 : (r.previous.downloads_30d ?? 0) + (r.previous.installs ?? 0));
    }
  }
  return { totalStars, starsDeltaWeek, totalDownloads, downloadsDeltaWeek, packagesTracked: rows.length, totalMrr, totalUsers, hasSaas: rows.some((r) => r.pkg.platform === 'saas') };
}
