import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import {
  getMonthLedger, getCategoryBreakdown, getDailyNet, getYearFinance,
  getCustomCategories, getCategoryRules, getObligationsOverview, getTdsSummary,
  getStreamsOverview, getIncomeStreams, monthEndOf,
} from '@/features/daily-finance/queries';
import { parseMonth, parseYear, monthTitle } from '@/features/daily-finance/period';
import { PeriodNav } from '@/features/daily-finance/components/PeriodNav';
import { DailyFinanceClient } from '@/features/daily-finance/components/DailyFinanceClient';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

export default async function DailyFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; year?: string }>;
}) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const sp = await searchParams;
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));

  const view: 'month' | 'year' = sp.view === 'year' ? 'year' : 'month';
  const month = parseMonth(sp.month, currentMonth);
  const year = view === 'year' ? parseYear(sp.year, currentYear) : Number(month.slice(0, 4));
  const monthStart = `${month}-01`;
  const isCurrentMonth = month === currentMonth;
  // New salary / expense entries default to today, or to the last day of a past month.
  const defaultDate = isCurrentMonth ? today : monthEndOf(monthStart);

  const settings = await getSettings(email);

  // Only load what the chosen view actually shows.
  const monthData = view === 'month'
    ? await Promise.all([
        getMonthLedger(email, monthStart),
        getCategoryBreakdown(email, monthStart),
        getDailyNet(email, monthStart),
        getCustomCategories(email),
        getCategoryRules(email),
        getObligationsOverview(email, monthStart),
      ])
    : null;
  const yearData = view === 'year'
    ? await Promise.all([
        getYearFinance(email, year),
        getTdsSummary(email, year),
        getStreamsOverview(email, year, year === currentYear ? today : `${year}-12-31`),
        getIncomeStreams(email),
      ])
    : null;

  return (
    <Shell active="daily-finance" title="Daily Finance" crumb="Personal">
      <div className="df-toolbar">
        <PeriodNav basePath="/daily-finance" view={view} month={month} year={year} currentMonth={currentMonth} currentYear={currentYear} />
        <div className="df-links">
          <Link href="/daily-finance/sister" className="link-btn">Given to sister →</Link>
          <Link href="/daily-finance/investments" className="link-btn">Investments →</Link>
          <Link href="/daily-finance/dues" className="link-btn">Dues →</Link>
        </div>
      </div>

      <DailyFinanceClient
        view={view}
        isCurrentMonth={isCurrentMonth}
        monthLabel={monthTitle(month)}
        defaultDate={defaultDate}
        currency={settings.targets.currency}
        yearLabel={String(year)}
        {...(monthData && {
          days: monthData[0].days,
          monthTotals: monthData[0].totals,
          categoryBreakdown: monthData[1],
          dailyNet: monthData[2],
          customCategories: monthData[3],
          categoryRules: monthData[4],
          obligations: monthData[5],
        })}
        {...(yearData && {
          yearTotals: yearData[0].totals,
          monthRows: yearData[0].months,
          tdsYtd: yearData[1],
          streamsOverview: yearData[2].overview,
          incomeCategories: yearData[2].incomeCategories,
          incomeStreams: yearData[3],
        })}
      />
    </Shell>
  );
}
