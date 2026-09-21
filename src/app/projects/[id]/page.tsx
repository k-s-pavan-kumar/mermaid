import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getProjectById } from '@/features/projects/queries';
import {
  updateProjectStatus,
  updateProject,
  updateProjectTargets,
  deleteProjectAndReturn,
  addPhase,
  updatePhase,
  deletePhase,
  movePhase,
  addSubmission,
  addMilestone,
  addMetric,
} from '@/features/projects/actions';
import { addQuote, addInvoice, markInvoicePaidForProject } from '@/features/billing/actions';
import { grandTotal } from '@/features/billing/types';
import { getSettings } from '@/features/settings/queries';
import { scaffoldProject } from '@/features/scaffold/actions';
import { ScaffoldCard } from '@/features/scaffold/ScaffoldCard';
import { SkillPanel } from '@/features/assistant/components/SkillPanel';
import { skillCards } from '@/features/assistant/skills';
import { runSkillAction } from '@/features/assistant/actions';
import { getIntegrationsForProject } from '@/features/integrations/queries';
import { connectIntegration, refreshIntegration, disconnectIntegration } from '@/features/integrations/actions';
import { PROVIDER_LABEL, PROVIDER_CONFIG_FIELD } from '@/features/integrations/types';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { PhaseEditor } from '@/features/projects/components/PhaseEditor';
import { ProjectTypePicker } from '@/features/projects/components/ProjectTypePicker';
import { getClients } from '@/features/clients/queries';
import { TYPE_COLOR, TYPE_LABEL, projectTypes, hasType } from '@/lib/project-colors';
import { getTasksForProject } from '@/features/today/queries';
import { addProjectTask, toggleTaskDone, setTaskLoggedHours } from '@/features/today/actions';
import { projectTime, fmtHours } from '@/features/projects/time';
import { table } from '@/lib/data';
import type { FocusSession } from '@/features/today/types';
import { fmtRange } from '@/features/today/time';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const TAB_LABEL: Record<string, string> = {
  overview: 'Overview', todo: 'To-do', milestones: 'Milestones', billing: 'Quotes & Invoices', submissions: 'Submissions', skills: 'AI skills', settings: 'Settings',
};
const STATUS: Record<string, string> = {
  idea: 'Idea', ontrack: 'On track', review: 'In review', risk: 'At risk', done: 'Done', dropped: 'Dropped',
};

export default async function ProjectDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; scaffold?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const { tab, scaffold } = await searchParams;
  const project = await getProjectById(id);
  if (!project || project.owner_id !== email) notFound();

  const activeTab = tab ?? 'overview';
  // Tabs follow the full type set, not just the primary one — a project
  // tagged both "Client" and "Bug Bounty" needs billing *and* submissions.
  const showBilling = hasType(project, 'client');
  const showSubmissions = hasType(project, 'bounty');
  const tabs = ['overview', 'todo', 'milestones', ...(showBilling ? ['billing'] : []), ...(showSubmissions ? ['submissions'] : []), 'skills', 'settings'];
  const types = projectTypes(project);
  const clients = await getClients(email);
  const settings = await getSettings(email);

  const tasks = await getTasksForProject(id);
  const boundAddProjectTask = addProjectTask.bind(null, id);

  const integrations = await getIntegrationsForProject(id);
  const boundAddPhase = addPhase.bind(null, id);
  const boundAddQuote = addQuote.bind(null, id);
  const boundAddInvoice = addInvoice.bind(null, id);
  const boundAddSubmission = addSubmission.bind(null, id);
  const boundAddMilestone = addMilestone.bind(null, id);
  const boundAddMetric = addMetric.bind(null, id);
  const boundUpdateStatus = updateProjectStatus.bind(null, id);
  const boundUpdateProject = updateProject.bind(null, id);
  const boundUpdateProjectTargets = updateProjectTargets.bind(null, id);
  const boundUpdatePhase = updatePhase.bind(null, id);
  const boundDeletePhase = deletePhase.bind(null, id);
  const boundMovePhase = movePhase.bind(null, id);
  const boundConnect = connectIntegration.bind(null, id);

  // Totals include tax, so the project page and the document agree.
  const invoiced = project.invoices.filter((i) => i.status !== 'draft').reduce((s, i) => s + grandTotal(i), 0);
  const paid = project.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + grandTotal(i), 0);

  const sessions = await table<FocusSession>('focus_sessions').where((s) => s.project_id === id);
  const bountyPaid = project.submissions.reduce((s, x) => s + (x.payout ?? 0), 0);
  const time = projectTime({ tasks, sessions, invoiced, collected: paid + bountyPaid });

  const deleteAction = (
    <form action={async () => { 'use server'; await deleteProjectAndReturn(id); }}>
      <SubmitButton
        className="btn-link"
        pendingLabel="Deleting…"
        confirm={`Delete "${project.name}"? Its phases, quotes, invoices, milestones and submissions go with it. Tasks are kept but lose the project tag.`}
      >
        Delete project
      </SubmitButton>
    </form>
  );

  return (
    <Shell active="projects" title={project.name} crumb="Workspace · Projects" action={deleteAction}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 10 }}>
        {types.map((t) => (
          <span key={t} className="type-badge" style={{ color: TYPE_COLOR[t], borderColor: TYPE_COLOR[t] }}>
            <span className="type-dot" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      {project.description && <p className="text-muted" style={{ marginTop: 0 }}>{project.description}</p>}

      <form action={boundUpdateStatus} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <span className="text-muted" style={{ fontSize: 12 }}>Status</span>
        <select name="status" defaultValue={project.status}>
          {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <SubmitButton className="btn-ghost" pendingLabel="Saving…">Save</SubmitButton>
      </form>

      <div className="stat-row">
        <div className="stat-box">
          <div className="lbl">Hours worked</div>
          <div className="val">{fmtHours(time.hours)}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>from task time + timer</div>
        </div>
        <div className="stat-box">
          <div className="lbl">Invoiced</div>
          <div className="val">{inr(invoiced)}</div>
        </div>
        <div className="stat-box">
          <div className="lbl">Rate / hr · invoiced</div>
          <div className="val">{time.rateInvoiced ? inr(time.rateInvoiced) : '—'}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>{time.hours > 0 ? 'invoiced ÷ hours' : 'log hours on the To-do tab'}</div>
        </div>
        <div className="stat-box">
          <div className="lbl">Rate / hr · collected</div>
          <div className="val" style={{ color: 'var(--sage)' }}>{time.rateCollected ? inr(time.rateCollected) : '—'}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>paid ÷ hours</div>
        </div>
      </div>

      <div className="tab-row">
        {tabs.map((t) => (
          <a key={t} href={`/projects/${id}?tab=${t}`} className={activeTab === t ? 'active' : ''}>{TAB_LABEL[t]}</a>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div>
          <PhaseEditor
            phases={project.phases}
            updatePhase={boundUpdatePhase}
            deletePhase={boundDeletePhase}
            movePhase={boundMovePhase}
          />
          <div className="section-title"><h3>Add phase</h3></div>
          <form action={boundAddPhase} className="form-row">
            <input name="label" placeholder="Phase label" required />
            <input name="color" type="color" defaultValue="#1F5C4E" style={{ flex: '0 0 48px', padding: 3 }} title="Phase colour — editable later too" />
            <input name="width_pct" type="number" min={1} max={100} placeholder="% width" defaultValue={20} />
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add</SubmitButton>
          </form>
        </div>
      )}

      {activeTab === 'todo' && (
        <div>
          {tasks.length === 0 ? (
            <div className="card"><div className="empty"><div className="big">No tasks yet</div>Add one below — it'll show up on Today too.</div></div>
          ) : (
            <div className="card" style={{ padding: '4px 18px' }}>
              {tasks.map((t) => (
                <div key={t.id} className="list-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <ActionButton
                      action={async () => { 'use server'; await toggleTaskDone(t.id, !t.done); }}
                      className={`check-btn${t.done ? ' checked' : ''}`}
                      aria-label={t.done ? 'Mark not done' : 'Mark done'}
                    >
                      <span className="sr-only">{t.done ? 'Done' : 'Not done'}</span>
                    </ActionButton>
                    <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--muted)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <form
                      action={async (fd: FormData) => { 'use server'; await setTaskLoggedHours(t.id, fd); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      title="Hours actually worked on this task"
                    >
                      <input name="hours" type="number" min={0} max={2000} step="0.25"
                        defaultValue={Math.round(((t.logged_minutes ?? 0) / 60) * 100) / 100}
                        aria-label={`Hours worked on ${t.title}`} style={{ width: 64, padding: '4px 6px', fontSize: 12 }} />
                      <span className="text-muted" style={{ fontSize: 11 }}>h</span>
                      <SubmitButton className="btn-link" pendingLabel="…">Save</SubmitButton>
                    </form>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>
                      {t.scheduled_date ? `${t.scheduled_date} · ${fmtRange(t)}` : 'Unscheduled'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="section-title"><h3>Add a task</h3></div>
          <form action={boundAddProjectTask} className="form-row">
            <input name="title" placeholder="What needs doing?" required />
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add</SubmitButton>
          </form>
          <p className="text-muted text-sm">
            Enter the hours you actually worked next to each task — the rate boxes above are invoiced/collected
            money ÷ these hours (timer sessions on a task are added automatically). Unscheduled tasks show up in Today's brain dump tagged with this project. Scheduling or
            completing them there updates this list too — it's the same record either way.
          </p>
        </div>
      )}

      {activeTab === 'milestones' && (
        <div>
          {project.metrics.length > 0 && (
            <div className="metric-row">
              {project.metrics.map((m) => (
                <div key={m.id} className="metric-box">
                  <div className="text-muted" style={{ fontSize: 11 }}>{m.label}</div>
                  <div style={{ fontSize: 19, fontFamily: "'Fraunces',serif" }}>{m.value}</div>
                  {m.delta && <div style={{ fontSize: 11, color: 'var(--sage)' }}>{m.delta}</div>}
                </div>
              ))}
            </div>
          )}

          {project.milestones.length === 0 ? (
            <div className="card"><div className="empty"><div className="big">No milestones yet</div>Releases, downloads and stars show up here.</div></div>
          ) : (
            <div className="card" style={{ padding: '4px 18px' }}>
              {project.milestones.map((m) => (
                <div key={m.id} className="list-row">
                  <span>{m.label}</span>
                  <span className="mono text-muted" style={{ fontSize: 11.5 }}>{m.occurred_on ?? '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="section-title"><h3>Connected data sources</h3></div>
          {integrations.length === 0 && <p className="text-muted text-sm">Nothing connected — metrics are manual until you connect a source.</p>}
          {integrations.length > 0 && (
            <div className="card" style={{ padding: '4px 18px', marginBottom: 12 }}>
              {integrations.map((integ) => (
                <div key={integ.id} className="list-row">
                  <div>
                    <strong>{PROVIDER_LABEL[integ.provider]}</strong> — {Object.values(integ.config).join(', ')}
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {integ.last_synced_at ? `Last synced ${new Date(integ.last_synced_at).toLocaleString()}` : 'Never synced'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <form action={async () => { 'use server'; await refreshIntegration(id, integ.id); }}>
                      <SubmitButton className="btn-ghost" pendingLabel="Syncing…">Refresh</SubmitButton>
                    </form>
                    <form action={async () => { 'use server'; await disconnectIntegration(id, integ.id); }}>
                      <SubmitButton className="btn-link" pendingLabel="Removing…" confirm="Disconnect this data source?">Disconnect</SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Object.keys(PROVIDER_LABEL) as (keyof typeof PROVIDER_LABEL)[]).map((provider) => (
              <form key={provider} action={boundConnect} style={{ display: 'flex', gap: 6 }}>
                <input type="hidden" name="provider" value={provider} />
                <input type="hidden" name="config_key" value={PROVIDER_CONFIG_FIELD[provider].key} />
                <input name="config_value" placeholder={PROVIDER_CONFIG_FIELD[provider].placeholder} style={{ width: 150 }} />
                <SubmitButton className="btn-ghost" pendingLabel="Connecting…">Connect {PROVIDER_LABEL[provider]}</SubmitButton>
              </form>
            ))}
          </div>

          <div className="grid-2-eq" style={{ marginTop: 24 }}>
            <div>
              <h4>Log a milestone</h4>
              <form action={boundAddMilestone} className="form-grid">
                <input name="label" placeholder="e.g. v1.0 released" required />
                <input name="occurred_on" type="date" />
                <SubmitButton className="btn-inline" pendingLabel="Adding…" style={{ width: 'fit-content' }}>Add</SubmitButton>
              </form>
            </div>
            <div>
              <h4>Record a metric</h4>
              <form action={boundAddMetric} className="form-grid">
                <input name="label" placeholder="e.g. GitHub stars" required />
                <input name="value" placeholder="e.g. 128" required />
                <input name="delta" placeholder="e.g. +12 this week" />
                <SubmitButton className="btn-inline" pendingLabel="Adding…" style={{ width: 'fit-content' }}>Add</SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && showBilling && (
        <div>
          <div className="stat-row three">
            <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{inr(invoiced)}</div></div>
            <div className="stat-box"><div className="lbl">Paid</div><div className="val" style={{ color: 'var(--sage)' }}>{inr(paid)}</div></div>
            <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: 'var(--crimson)' }}>{inr(invoiced - paid)}</div></div>
          </div>

          <div className="section-title"><h3>Quotes</h3></div>
          {project.quotes.length === 0 ? <p className="text-muted text-sm">No quotes yet.</p> : (
            <div className="table-wrap">
              <table className="docs">
                <thead><tr><th>No.</th><th>Description</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {project.quotes.map((q) => (
                    <tr key={q.id}>
                      <td className="mono"><a href={`/billing/quotes/${q.id}`}>{q.number}</a></td><td>{q.description}</td>
                      <td className="mono">{q.issued_at ?? '—'}</td><td className="mono">{inr(grandTotal(q))}</td>
                      <td><span className={`tag ${q.status === 'accepted' ? 'done' : q.status === 'declined' ? 'risk' : 'review'}`}>{q.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={boundAddQuote} className="form-row">
            <input name="number" placeholder="Quote no." required />
            <input name="description" placeholder="Description" />
            <input name="amount" type="number" placeholder="Amount (₹)" required />
            <select name="status" defaultValue="sent">
              <option value="draft">Draft</option><option value="sent">Sent</option>
              <option value="accepted">Accepted</option><option value="declined">Declined</option>
            </select>
            <input name="issued_at" type="date" />
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add quote</SubmitButton>
          </form>

          <div className="section-title"><h3>Invoices</h3></div>
          {project.invoices.length === 0 ? <p className="text-muted text-sm">No invoices yet.</p> : (
            <div className="table-wrap">
              <table className="docs">
                <thead><tr><th>No.</th><th>Description</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {project.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono"><a href={`/billing/invoices/${inv.id}`}>{inv.number}</a></td><td>{inv.description}</td>
                      <td className="mono">{inv.due_at ?? '—'}</td><td className="mono">{inr(grandTotal(inv))}</td>
                      <td><span className={`tag ${inv.status === 'paid' ? 'ontrack' : inv.status === 'overdue' ? 'risk' : inv.status === 'pending' ? 'review' : 'idea'}`}>{inv.status}</span></td>
                      <td>
                        {inv.status !== 'paid' && (
                          <form action={async () => { 'use server'; await markInvoicePaidForProject(id, inv.id); }}>
                            <SubmitButton className="btn-ghost" pendingLabel="Saving…" style={{ fontSize: 12, padding: '4px 10px' }}>Mark paid</SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={boundAddInvoice} className="form-row">
            <input name="number" placeholder="Invoice no." required />
            <input name="description" placeholder="Description" />
            <input name="amount" type="number" placeholder="Amount (₹)" required />
            <select name="status" defaultValue="pending">
              <option value="draft">Draft</option><option value="pending">Pending</option>
              <option value="paid">Paid</option><option value="overdue">Overdue</option>
            </select>
            <input name="issued_at" type="date" />
            <input name="due_at" type="date" />
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add invoice</SubmitButton>
          </form>
        </div>
      )}

      {activeTab === 'submissions' && showSubmissions && (
        <div>
          {project.submissions.length === 0 ? <p className="text-muted text-sm">No submissions yet.</p> : (
            <div className="table-wrap">
              <table className="docs">
                <thead><tr><th>Program</th><th>Severity</th><th>Status</th><th>Payout</th><th>Deadline</th></tr></thead>
                <tbody>
                  {project.submissions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.program}</td><td>{s.severity}</td>
                      <td><span className={`tag ${s.status === 'accepted' ? 'ontrack' : s.status === 'triaged' ? 'review' : s.status === 'duplicate' || s.status === 'rejected' ? 'risk' : 'idea'}`}>{s.status}</span></td>
                      <td className="mono">{s.payout != null ? inr(s.payout) : '—'}</td>
                      <td className="mono" style={{ color: s.disclosure_deadline ? 'var(--crimson)' : undefined }}>{s.disclosure_deadline ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={boundAddSubmission} className="form-row">
            <input name="program" placeholder="Program (e.g. Acme · HackerOne)" required />
            <select name="severity" defaultValue="medium">
              <option value="low">Low</option><option value="medium">Medium</option>
              <option value="high">High</option><option value="critical">Critical</option>
            </select>
            <select name="status" defaultValue="submitted">
              <option value="submitted">Submitted</option><option value="triaged">Triaged</option>
              <option value="accepted">Accepted</option><option value="duplicate">Duplicate</option>
              <option value="rejected">Rejected</option>
            </select>
            <input name="payout" type="number" placeholder="Payout (₹)" />
            <input name="disclosure_deadline" type="date" />
            <SubmitButton className="btn-inline" pendingLabel="Adding…">Add submission</SubmitButton>
          </form>
        </div>
      )}
      {activeTab === 'skills' && (
        <SkillPanel
          title={`Skills for ${project.name}`}
          intro="Everything here reads this project's real record — its phases, tasks, milestones and notes — so the output is about this project, not a template."
          skills={skillCards('project')}
          projectId={id}
          run={runSkillAction}
        />
      )}

      {activeTab === 'settings' && (
        <div>
          <div className="card" style={{ maxWidth: 560 }}>
            <h3>Project details</h3>
            <form action={boundUpdateProject} className="form-grid" style={{ maxWidth: '100%' }}>
              <div>
                <label className="field-label" htmlFor="pname">Name</label>
                <input id="pname" name="name" defaultValue={project.name} required style={{ width: '100%' }} />
              </div>

              <div>
                <label className="field-label">Type — pick one or more</label>
                <ProjectTypePicker initial={types} />
              </div>

              <div>
                <label className="field-label" htmlFor="client_id">Client (optional)</label>
                <select id="client_id" name="client_id" defaultValue={project.client_id ?? ''} style={{ width: '100%' }}>
                  <option value="">— Not billed to a client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                </select>
                <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                  Links this project to a row in Clients for their timezone and billing. Separate from
                  the type — internal, open-source and personal work simply have no client.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="pdesc">Description</label>
                <textarea id="pdesc" name="description" defaultValue={project.description ?? ''} rows={3} style={{ width: '100%' }} />
              </div>

              <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Save changes</SubmitButton>
            </form>
          </div>

          <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
            <h3>Target for this project</h3>
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: -4 }}>
              &ldquo;{project.name} should get 15h/week&rdquo; — separate from the
              workspace-wide targets in Settings. Shows up on the{' '}
              <a href="/dashboard">Dashboard</a> only while at least one of these is above 0.
            </p>
            <form action={boundUpdateProjectTargets} className="grid-2-eq" style={{ maxWidth: '100%' }}>
              <div>
                <label className="field-label" htmlFor="proj_weekly_focus_hours">Focused hours / week</label>
                <input id="proj_weekly_focus_hours" name="weekly_focus_hours" type="number" min={0} max={168} step="0.5"
                  defaultValue={project.targets?.weekly_focus_hours ?? 0} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label" htmlFor="proj_monthly_focus_hours">Focused hours / month</label>
                <input id="proj_monthly_focus_hours" name="monthly_focus_hours" type="number" min={0} max={744} step="1"
                  defaultValue={project.targets?.monthly_focus_hours ?? 0} style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Save target</SubmitButton>
              </div>
            </form>
          </div>

          {scaffold === 'created' && (
            <p className="scaffold-result ok" style={{ maxWidth: 560 }}>
              ✓ Folder created on disk when the project was added.
            </p>
          )}
          {scaffold === 'failed' && (
            <p className="scaffold-result bad" style={{ maxWidth: 560 }}>
              × The folder wasn&apos;t created — try again below to see why.
            </p>
          )}

          <div style={{ marginTop: 18 }}>
            <ScaffoldCard
              defaultFolder={project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}
              codeRoot={settings.code_root}
              scaffold={scaffoldProject.bind(null, id)}
            />
          </div>

          <div className="card danger-card" style={{ maxWidth: 560, marginTop: 18 }}>
            <h3 style={{ color: 'var(--crimson)' }}>Danger zone</h3>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
              Deleting removes the project with its phases, quotes, invoices, milestones, metrics and
              submissions. Tasks survive — they just stop being tagged to this project.
            </p>
            <form action={async () => { 'use server'; await deleteProjectAndReturn(id); }}>
              <SubmitButton
                className="btn-danger"
                pendingLabel="Deleting…"
                confirm={`Delete "${project.name}"? This cannot be undone.`}
              >
                Delete this project
              </SubmitButton>
            </form>
          </div>
        </div>
      )}

    </Shell>
  );
}
