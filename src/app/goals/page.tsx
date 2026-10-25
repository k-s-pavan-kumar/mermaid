import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';
import { getProductsSafe } from '@/features/products/queries';
import { loadTargetData } from '@/features/targets/queries';
import { TargetsOverview } from '@/features/targets/components/TargetsOverview';
import { todayIso } from '@/lib/tz/today';
import { getSessionDisplayName } from '@/lib/auth/session';

/**
 * Goals across your fields (SaaS, Gaming, Publishing, …). TPN's goals are
 * deliberately left out — they live on the TPN Audits page with their own
 * targets. Each field's own page shows only that field's goals.
 */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ year?: string; view?: string; notice?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const sp = await searchParams;
  const today = todayIso();
  const parsed = Number(sp.year);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : Number(today.slice(0, 4));
  const [fields, products, targetData, sender] = await Promise.all([getFieldsSafe(email), getProductsSafe(email), loadTargetData(email, year), getSessionDisplayName()]);
  return (
    <Shell active="goals" title="Goals" crumb="Workspace">
      <TargetsOverview year={year} today={today} data={targetData} sender={sender ?? undefined} />
      <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath="/goals" scope={{ kind: 'all' }} fields={fields} products={products} />
    </Shell>
  );
}
