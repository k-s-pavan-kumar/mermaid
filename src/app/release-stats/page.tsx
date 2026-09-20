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
        Stars, downloads, and installs across everything you&apos;ve shipped — pulled in
        automatically, never typed in.
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
        <div className="stat"><div className="lbl">Packages tracked</div><div className="val">{summary.packagesTracked}</div></div>
      </div>

      <ReleaseStatsClient groups={groups} />

      <p className="text-muted" style={{ fontSize: 12, marginTop: 20, maxWidth: 700, lineHeight: 1.6 }}>
        Every number here is pulled, not entered. npm and GitHub figures come from their
        public APIs on a manual &ldquo;Sync now&rdquo; (there&apos;s no background job in this
        deployment yet). If a source is briefly unreachable, the card keeps its last known
        values and marks them stale rather than showing a zero. Chrome Web Store has no
        public API to pull from, so those cards are entered and refreshed by hand.
      </p>
    </Shell>
  );
}
