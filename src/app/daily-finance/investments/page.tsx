import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { getInvestmentLog } from '@/features/daily-finance/set-aside';
import { InvestmentsPageClient } from '@/features/daily-finance/components/InvestmentsPageClient';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

export default async function InvestmentsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const [settings, entries] = await Promise.all([getSettings(email), getInvestmentLog(email)]);

  return (
    <Shell active="daily-finance" title="Investments" crumb="Personal · Daily Finance">
      <InvestmentsPageClient entries={entries} currency={settings.targets.currency} today={todayIso()} />
    </Shell>
  );
}
