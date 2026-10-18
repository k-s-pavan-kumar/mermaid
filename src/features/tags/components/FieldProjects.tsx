import { SubmitButton } from '@/components/SubmitButton';
import { createFieldProject, setProjectField } from '../actions';
import type { Tag } from '../types';
import type { Project } from '@/features/projects/types';

const STATUS: Record<string, string> = { idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped' };

/**
 * The projects of one field, plus the form to start a new one right here:
 * pick a client and it's client work, leave it empty and it's your own.
 */
export function FieldProjects({
  field, projects, clients,
}: { field: Tag; projects: Project[]; clients: { id: string; name: string; company?: string | null }[] }) {
  const mine = projects.filter((p) => p.field_id === field.id);
  const spare = projects.filter((p) => !p.field_id);
  const clientName = new Map(clients.map((c) => [c.id, c.company ? `${c.name} · ${c.company}` : c.name]));

  return (
    <div className="card">
      <h3>{field.name} projects</h3>
      {mine.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>No projects in this field yet.</p>}
      {mine.map((p) => (
        <div key={p.id} className="list-row">
          <span style={{ minWidth: 0 }}>
            <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</a>
            <div className="text-muted" style={{ fontSize: 11.5 }}>{p.client_id && clientName.get(p.client_id) ? clientName.get(p.client_id) : 'Own project'}</div>
          </span>
          <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
        </div>
      ))}

      <form action={createFieldProject.bind(null, field.id)} className="form-row" style={{ marginTop: 12, marginBottom: 0 }}>
        <input name="name" placeholder={`New ${field.name} project`} required maxLength={120} />
        <select name="client_id" defaultValue="" aria-label="Client (optional)">
          <option value="">No client — my own project</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{clientName.get(c.id)}</option>)}
        </select>
        <SubmitButton className="btn-inline" pendingLabel="Creating…">Create</SubmitButton>
      </form>

      {spare.length > 0 && (
        <form action={setProjectField} className="form-row" style={{ marginTop: 8, marginBottom: 0 }}>
          <input type="hidden" name="field_id" value={field.id} />
          <select name="project_id" required defaultValue="" aria-label="Existing project">
            <option value="" disabled>Or add an existing project…</option>
            {spare.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add</SubmitButton>
        </form>
      )}
    </div>
  );
}
