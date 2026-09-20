import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getProjects, getEarningsSummary } from '@/features/projects/queries';
import { createProject, deleteProject } from '@/features/projects/actions';
import { getClients } from '@/features/clients/queries';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { ProjectTypePicker } from '@/features/projects/components/ProjectTypePicker';
import { TYPE_COLOR, TYPE_LABEL, TYPE_ORDER, projectTypes } from '@/lib/project-colors';
import { getSettings } from '@/features/settings/queries';
import type { ProjectType } from '@/features/projects/types';

const STATUS: Record<string, string> = {
  idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped',
};

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { type } = await searchParams;
  const activeType = (type && type in TYPE_COLOR ? (type as ProjectType) : undefined);

  const projects = await getProjects(activeType);
  const clients = await getClients(email);
  const earnings = await getEarningsSummary();
  const settings = await getSettings(email);

  return (
    <Shell active="projects" title="Projects" crumb="Workspace">
      <div className="stat-row three">
        <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{inr(earnings.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Paid (incl. bounties)</div><div className="val" style={{ color: 'var(--sage)' }}>{inr(earnings.paid)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: 'var(--crimson)' }}>{inr(earnings.outstanding)}</div></div>
      </div>

      <div className="chip-row">
        <a href="/projects" className={!activeType ? 'active' : ''}>All</a>
        {TYPE_ORDER.map((t) => (
          <a key={t} href={`/projects?type=${t}`} className={activeType === t ? 'active' : ''}>{TYPE_LABEL[t]}</a>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">No projects here yet</div>Create one below to get started.</div></div>
      ) : (
        <div className="card" style={{ padding: '4px 18px' }}>
          {projects.map((p) => {
            const types = projectTypes(p);
            return (
              <div key={p.id} className="list-row">
                <div style={{ minWidth: 0 }}>
                  <a href={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>{p.name}</a>
                  <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                    {types.map((t) => (
                      <span key={t} style={{ whiteSpace: 'nowrap' }}>
                        <span className="type-dot" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}
                      </span>
                    ))}
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`tag ${p.status}`}>{STATUS[p.status]}</span>
                  <ActionButton
                    action={async () => { 'use server'; await deleteProject(p.id); }}
                    className="btn-link"
                    pendingLabel="Deleting…"
                    confirm={`Delete "${p.name}"? Its phases, quotes, invoices, milestones and submissions go with it. Tasks are kept but lose the project tag.`}
                  >
                    Delete
                  </ActionButton>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title"><h3>New project</h3></div>
      <form action={createProject} className="form-grid" style={{ maxWidth: 560 }}>
        <input name="name" placeholder="Project name *" required />

        <div>
          <label className="field-label">Type — pick one or more</label>
          <ProjectTypePicker initial={['client']} />
        </div>

        <div>
          <label className="field-label" htmlFor="client_id">Client (optional)</label>
          <select id="client_id" name="client_id" defaultValue="" style={{ width: '100%' }}>
            <option value="">— Not billed to a client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
          </select>
          <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            This only links the project to someone in Clients so their timezone, contact details and
            billing hang off it. It is separate from the type above — leave it empty for your own
            projects, open-source work or anything you aren&apos;t invoicing.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue="idea" style={{ width: '100%' }}>
            {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <textarea name="description" placeholder="Description" rows={2} />

        {settings.code_root ? (
          <details className="scaffold-inline">
            <summary>Create the folder on disk too</summary>
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Scaffolds <span className="mono">{settings.code_root}/&lt;folder&gt;</span> as part of creating the
              project. Leave the folder name blank to use the project name. Refuses to touch a folder
              that already has files in it.
            </p>
            <label className="scaffold-check" style={{ marginBottom: 8 }}>
              <input type="checkbox" name="scaffold" />
              <span>Yes, create it now</span>
            </label>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <input name="folder" placeholder="folder-name (optional)" className="mono" />
              <select name="stack" defaultValue="nextjs">
                <option value="nextjs">Next.js + TypeScript</option>
                <option value="node-cli">Node CLI (ESM)</option>
                <option value="python">Python package</option>
                <option value="static">Static HTML</option>
              </select>
            </div>
            <label className="scaffold-check" style={{ marginTop: 8 }}>
              <input type="checkbox" name="dev_browser" defaultChecked />
              <span>Wire in <span className="mono">nextjs-dev-browser</span> (Next.js only)</span>
            </label>
          </details>
        ) : (
          <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
            Set a <a href="/settings">code root folder</a> in Settings and this form can create the
            project folder on disk at the same time.
          </p>
        )}

        <SubmitButton className="btn" pendingLabel="Creating…" style={{ width: 'fit-content' }}>Create project</SubmitButton>
      </form>
    </Shell>
  );
}
