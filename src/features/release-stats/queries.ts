import { table } from '@/lib/data';
import type { TrackedPackage, MetricSnapshot } from './types';

export interface PackageWithMetrics {
  pkg: TrackedPackage;
  latest: MetricSnapshot | null;
  previous: MetricSnapshot | null; // for the week-over-week delta
  history: MetricSnapshot[]; // last 7, oldest first — for the sparkline
}

export async function getPackagesWithMetrics(ownerId: string): Promise<PackageWithMetrics[]> {
  const packages = await table<TrackedPackage>('tracked_packages').where((p) => p.owner_id === ownerId);
  const out: PackageWithMetrics[] = [];

  for (const pkg of packages) {
    const snapshots = await table<MetricSnapshot>('metric_snapshots').where((s) => s.package_id === pkg.id);
    const sorted = [...snapshots].sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));
    out.push({
      pkg,
      latest: sorted[0] ?? null,
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
