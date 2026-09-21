import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { getObligationsOverview, getCustomCategories } from '@/features/daily-finance/queries';
import { DuesPageClient } from '@/features/daily-finance/components/DuesPageClient';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function DuesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { month } = await searchParams;
  const currentMonth = todayIso().slice(0, 7);
  const ym = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentMonth;
  const monthStart = `${ym}-01`;

  const [settings, obligations, customCategories] = await Promise.all([
    getSettings(email),
    getObligationsOverview(email, monthStart),
    getCustomCategories(email),
  ]);

  const monthLabel = new Date(monthStart + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <Shell active="daily-finance" title="Dues" crumb="Personal · Daily Finance">
      <DuesPageClient
        monthLabel={monthLabel}
        isCurrentMonth={ym === currentMonth}
        prevHref={`/daily-finance/dues?month=${shiftMonth(ym, -1)}`}
        nextHref={`/daily-finance/dues?month=${shiftMonth(ym, 1)}`}
        obligations={obligations}
        currency={settings.targets.currency}
        customCategories={customCategories}
      />
    </Shell>
  );
}
