import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getPackagesWithMetrics, groupByFamily, summarize } from '@/features/release-stats/queries';
import { ReleaseStatsClient } from '@/features/release-stats/components/ReleaseStatsClient';
import { Shell } from '@/components/Shell';

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default async function ReleaseStatsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const rows = await getPackagesWithMetrics(email);
  const groups = groupByFamily(rows);
  const summary = summarize(rows);

  return (
    <Shell active="release-stats" title="Release Stats" crumb="Products">
      <p className="text-muted" style={{ marginTop: -8, marginBottom: 18, maxWidth: 520 }}>
        Stars, downloads, installs and SaaS growth across everything you&apos;ve shipped.
      </p>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="lbl">Total GitHub stars</div>
          <div className="val">{fmtNum(summary.totalStars)}</div>
          {summary.starsDeltaWeek !== 0 && <div className="text-muted text-sm">{summary.starsDeltaWeek > 0 ? '+' : ''}{summary.starsDeltaWeek} this week</div>}
        </div>
        <div className="stat">
          <div className="lbl">Total downloads/installs</div>
          <div className="val">{fmtNum(summary.totalDownloads)}</div>
          {summary.downloadsDeltaWeek !== 0 && <div className="text-muted text-sm">{summary.downloadsDeltaWeek > 0 ? '+' : ''}{fmtNum(summary.downloadsDeltaWeek)} this week</div>}
        </div>
        <div className="stat"><div className="lbl">Products tracked</div><div className="val">{summary.packagesTracked}</div></div>
        {summary.hasSaas && (
          <>
            <div className="stat"><div className="lbl">SaaS active users</div><div className="val">{fmtNum(summary.totalUsers)}</div></div>
            <div className="stat"><div className="lbl">SaaS MRR</div><div className="val">{fmtNum(summary.totalMrr)}</div></div>
          </>
        )}
      </div>

      <ReleaseStatsClient groups={groups} />

      <p className="text-muted" style={{ fontSize: 12, marginTop: 20, maxWidth: 700, lineHeight: 1.6 }}>
        npm, PyPI, GitHub and VS Code Marketplace numbers are pulled from their public APIs when
        you press &ldquo;Sync now&rdquo; (there&apos;s no background job in this deployment yet).
        Figma plugins, Snapchat Lenses, the Chrome Web Store and SaaS products have no public
        stats API, so those numbers are entered with &ldquo;Edit&rdquo; and are never overwritten
        by a sync. If a source fails, the card keeps its last values and says why, rather than
        showing a zero. Set <code>GITHUB_TOKEN</code> to avoid GitHub&apos;s 60-requests/hour limit.
      </p>
    </Shell>
  );
}
