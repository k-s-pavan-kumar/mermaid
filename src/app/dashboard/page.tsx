import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { getDashboard } from '@/features/dashboard/queries';
import { DashboardClient } from '@/features/dashboard/components/DashboardClient';
import { Shell } from '@/components/Shell';

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

  const settings = await getSettings(ownerId);
  const data = await getDashboard(ownerId, settings.targets);

  return (
    <Shell active="dashboard" title="Dashboard" crumb="Workspace" view="dashboard">
      <DashboardClient data={data} />
    </Shell>
  );
}
