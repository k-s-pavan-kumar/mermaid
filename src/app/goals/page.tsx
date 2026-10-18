import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';

/**
 * Goals across your fields (SaaS, Gaming, Publishing, …). TPN's goals are
 * deliberately left out — they live on the TPN Audits page with their own
 * targets. Each field's own page shows only that field's goals.
 */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ year?: string; view?: string; notice?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const sp = await searchParams;
  const fields = await getFieldsSafe(email);
  return (
    <Shell active="goals" title="Goals" crumb="Workspace">
      <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath="/goals" scope={{ kind: 'all' }} fields={fields} />
    </Shell>
  );
}
