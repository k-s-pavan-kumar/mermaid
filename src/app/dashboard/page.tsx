import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings, getTargetsHistory } from '@/features/settings/queries';
import { getDashboard } from '@/features/dashboard/queries';
import { DashboardClient } from '@/features/dashboard/components/DashboardClient';
import { Shell } from '@/components/Shell';
import { getMonthTotals } from '@/features/daily-finance/queries';
import { getBountyStats } from '@/features/bounty-pipeline/queries';
import { getLearningStats } from '@/features/learning-tracker/queries';
import { getPackagesWithMetrics, summarize } from '@/features/release-stats/queries';
import { table } from '@/lib/data';
import type { Need } from '@/features/reward-vault/types';
import { vaultStats } from '@/features/reward-vault/queries';
import { todayIso } from '@/lib/tz/today';

function money(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}

/**
 * Everything else Meridian tracks, reduced to one number each. Deliberately
 * NOT the reconciled, write-triggering Reward Vault read (reconcileNeeds) —
 * a raw read for a summary strip shouldn't cost the same as opening the
 * actual page, and being briefly a few hours stale here has no real cost.
 */
async function getElsewhereSummary(ownerId: string, currency: string) {
  const monthStart = `${todayIso().slice(0, 7)}-01`;
  const [finance, bounty, learning, release, needs] = await Promise.all([
    getMonthTotals(ownerId, monthStart),
    getBountyStats(ownerId),
    getLearningStats(ownerId),
    getPackagesWithMetrics(ownerId).then(summarize),
    table<Need>('needs').where((n) => n.owner_id === ownerId),
  ]);
  const vault = vaultStats(needs);

  return [
    { href: '/daily-finance', label: 'Daily Finance', value: money(finance.net, currency), sub: 'net this month' },
    { href: '/bounty-pipeline', label: 'Bug Bounty', value: String(bounty.open), sub: 'open submissions' },
    { href: '/reward-vault', label: 'Reward Vault', value: String(vault.coolingOff), sub: 'cooling off' },
    { href: '/learning-tracker', label: 'Learning Tracker', value: String(learning.inProgress), sub: 'courses in progress' },
    { href: '/release-stats', label: 'Release Stats', value: String(release.totalStars), sub: 'GitHub stars' },
  ];
}

/**
 * The step back from Today.
 *
 * Today is the working surface — what's in front of you this hour. This is
 * the same records read at week / month / year scale: are the targets being
 * met, where did the 24 hours actually go, and is the financial year on
 * pace. Nothing here asks you to log anything new; every figure is derived
 * from focus sessions, scheduled blocks, meetings and invoices that the rest
 * of the app already writes.
 */
export default async function DashboardPage() {
  const ownerId = await getSessionEmail();
  if (!ownerId) redirect('/login');

  const [settings, targetsHistory] = await Promise.all([
    getSettings(ownerId),
    getTargetsHistory(ownerId),
  ]);
  const [data, elsewhere] = await Promise.all([
    getDashboard(ownerId, targetsHistory, settings.categories),
    getElsewhereSummary(ownerId, settings.targets.currency),
  ]);

  return (
    <Shell active="dashboard" title="Dashboard" crumb="Workspace" view="dashboard">
      <DashboardClient data={data} />

      {/* Everything else Meridian tracks, reduced to one number each and
          pushed to the very bottom — a glance and a link, never the thing
          you land on. The full picture for any of these lives on its own
          page, one click away via the sidebar's Personal group. */}
      <div className="section-title" style={{ marginTop: 28 }}><h3>Elsewhere</h3></div>
      <div className="elsewhere-strip">
        {elsewhere.map((e) => (
          <a key={e.href} href={e.href} className="elsewhere-card">
            <div className="el-label">{e.label}</div>
            <div className="el-value">{e.value}</div>
            <div className="el-sub">{e.sub}</div>
          </a>
        ))}
      </div>
    </Shell>
  );
}
