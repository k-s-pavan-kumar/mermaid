import { notFound, redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';
import { FieldProjects } from '@/features/tags/components/FieldProjects';
import { getFieldCosts, loadTargetData } from '@/features/targets/queries';
import { fieldView } from '@/features/targets/view';
import { AgingPanel } from '@/features/targets/components/AgingPanel';
import { FieldCosts } from '@/features/targets/components/FieldCosts';
import { getSessionDisplayName } from '@/lib/auth/session';
import { FieldTargetCards } from '@/features/targets/components/FieldTargetCards';
import { todayIso } from '@/lib/tz/today';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { clientWorkTypes } from '@/features/clients/types';

const STATUS: Record<string, string> = { idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped' };

/** One field's page: its own yearly targets, month plan, projects and clients — nothing from other fields. */
export default async function FieldPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; view?: string; notice?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;

  const fields = await getFieldsSafe(email);
  const field = fields.find((f) => f.id === id);
  if (!field) notFound();
  if (field.special === 'tpn') redirect('/tpn-audits');
  if (field.special === 'bounty') redirect('/bounty-pipeline');

  const today = todayIso();
  const parsed = Number(sp.year);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : Number(today.slice(0, 4));
  const [projects, clients, targetData, costs, sender] = await Promise.all([getProjects(), getClients(email), loadTargetData(email, year), getFieldCosts(email, year, { fieldId: field.id }), getSessionDisplayName()]);
  const myClients = clients.filter((c) => clientWorkTypes(c).some((t) => t.toLowerCase() === field.name.toLowerCase()));
  const view = fieldView(field.id, targetData, year, today);

  return (
    <Shell active={`field:${field.id}`} title={field.name} crumb="Fields">
      <FieldTargetCards name={field.name} year={year} view={view} />
      <AgingPanel receivables={view.receivables} sender={sender ?? undefined} />
      <FieldCosts fieldId={field.id} costs={costs} today={today} year={year} />

      <div className="grid-2-eq" style={{ marginBottom: 24, gap: 16, alignItems: 'start' }}>
        <FieldProjects field={field} projects={projects} clients={clients} />

        <div className="card">
          <h3>{field.name} clients</h3>
          {myClients.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
              No clients tagged yet. Tick &ldquo;{field.name}&rdquo; under <em>Type of work</em> on a client and they appear here.
            </p>
          )}
          {myClients.map((c) => (
            <div key={c.id} className="list-row">
              <a href={`/clients/${c.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{c.name}</a>
              {c.company && <span className="text-muted" style={{ fontSize: 12.5 }}>{c.company}</span>}
            </div>
          ))}
        </div>
      </div>

      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: '0 0 10px' }}>{field.name} goals</h2>
      <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath={`/fields/${field.id}`} scope={{ kind: 'field', field }} fields={fields} />
    </Shell>
  );
}
