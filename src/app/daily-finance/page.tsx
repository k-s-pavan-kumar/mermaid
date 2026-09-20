import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { getMonthLedger, getCategoryBreakdown, getDailyNet, getYearFinance } from '@/features/daily-finance/queries';
import { DailyFinanceClient } from '@/features/daily-finance/components/DailyFinanceClient';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

export default async function DailyFinancePage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const year = Number(today.slice(0, 4));
  const settings = await getSettings(email);

  const [{ days, totals }, categoryBreakdown, dailyNet, { totals: yearTotals, months }] = await Promise.all([
    getMonthLedger(email, monthStart),
    getCategoryBreakdown(email, monthStart),
    getDailyNet(email, monthStart),
    getYearFinance(email, year),
  ]);

  const monthLabel = new Date(monthStart + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <Shell active="daily-finance" title="Daily Finance" crumb="Personal">
      <p className="text-muted" style={{ marginTop: -8, marginBottom: 20, maxWidth: 480 }}>
        Every expense you log by hand. Every rupee in traces back to a project or bounty —
        never typed in on its own.
      </p>
      <DailyFinanceClient
        monthLabel={monthLabel}
        days={days}
        monthTotals={totals}
        categoryBreakdown={categoryBreakdown}
        dailyNet={dailyNet}
        yearLabel={String(year)}
        yearTotals={yearTotals}
        monthRows={months}
        currency={settings.targets.currency}
      />
    </Shell>
  );
}
