import { notFound, redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { GoalsBoard } from '@/features/goals/components/GoalsBoard';
import { getFieldsSafe } from '@/features/tags/queries';
import { setProjectField } from '@/features/tags/actions';
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

  const [projects, clients] = await Promise.all([getProjects(), getClients(email)]);
  const mine = projects.filter((p) => p.field_id === field.id);
  const spare = projects.filter((p) => !p.field_id);
  const myClients = clients.filter((c) => clientWorkTypes(c).some((t) => t.toLowerCase() === field.name.toLowerCase()));

  return (
    <Shell active={`field:${field.id}`} title={field.name} crumb="Fields">
      <GoalsBoard email={email} year={sp.year} view={sp.view} notice={sp.notice} basePath={`/fields/${field.id}`} scope={{ kind: 'field', field }} fields={fields} />

      <div className="grid-2-eq" style={{ marginTop: 22, gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h3>{field.name} projects</h3>
          {mine.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No projects in this field yet.</p>}
          {mine.map((p) => (
            <div key={p.id} className="list-row">
              <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
              <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
            </div>
          ))}
          {spare.length > 0 && (
            <form action={setProjectField} className="form-row" style={{ marginTop: 12, marginBottom: 0 }}>
              <input type="hidden" name="field_id" value={field.id} />
              <select name="project_id" required defaultValue="" aria-label="Project to add">
                <option value="" disabled>Add an existing project…</option>
                {spare.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add</SubmitButton>
            </form>
          )}
        </div>

        <div className="card">
          <h3>{field.name} clients</h3>
          {myClients.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13 }}>
              No clients yet. Tick &ldquo;{field.name}&rdquo; under <em>Type of work</em> on a client and they appear here.
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
    </Shell>
  );
}
