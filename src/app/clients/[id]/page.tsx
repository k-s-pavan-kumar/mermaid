import { redirect, notFound } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getClientWorkspace } from '@/features/clients/queries';
import { updateClient, deleteClientAndReturn, rotatePortalToken, revokePortalToken } from '@/features/clients/actions';
import { CLIENT_STATUS_LABEL, WORK_TYPE_COLOR, WORK_TYPE_LABEL, clientWorkTypes, type ClientStatus } from '@/features/clients/types';
import { addMeeting, updateMeetingNotes, followUpToTask, deleteMeeting } from '@/features/meetings/actions';
import { createInvoiceAndOpen, createQuoteAndOpen, markInvoicePaid } from '@/features/billing/actions';
import { grandTotal, STREAM_LABEL } from '@/features/billing/types';
import { getSettings } from '@/features/settings/queries';
import { getProjects } from '@/features/projects/queries';
import { toggleTaskDone } from '@/features/today/actions';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { WorkTypePicker } from '@/features/clients/components/WorkTypePicker';
import { ClientTime } from '@/features/clients/components/ClientTime';
import { DocForm } from '@/features/billing/components/DocForm';
import { TYPE_COLOR, primaryType } from '@/lib/project-colors';
import { SkillPanel } from '@/features/assistant/components/SkillPanel';
import { skillCards } from '@/features/assistant/skills';
import { runSkillAction } from '@/features/assistant/actions';

const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const TABS: Record<string, string> = {
  overview: 'Overview',
  work: 'Work',
  meetings: 'Meetings',
  billing: 'Billing',
  notes: 'Notes',
  skills: 'AI skills',
  portal: 'Share',
  settings: 'Details',
};

function fmtMeetingTime(iso: string, tz: string): { home: string; theirs: string } {
  const d = new Date(iso);
  const f = (zone?: string) =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      ...(zone ? { timeZone: zone } : {}),
    }).format(d);
  try {
    return { home: f('Asia/Kolkata'), theirs: f(tz) };
  } catch {
    return { home: f(), theirs: f() };
  }
}

export default async function ClientWorkspacePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; new?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { id } = await params;
  const { tab, new: creating } = await searchParams;
  const workspace = await getClientWorkspace(id);
  if (!workspace || workspace.client.owner_id !== email) notFound();

  const { client, projects, tasks, notes, meetings, invoices, quotes, money: totals } = workspace;
  const [settings, allProjects] = await Promise.all([getSettings(email), getProjects()]);
  const activeTab = tab && tab in TABS ? tab : 'overview';
  const openTasks = tasks.filter((t) => !t.done);
  const workTypes = clientWorkTypes(client);

  const boundAddMeeting = addMeeting.bind(null, id);
  const boundUpdateClient = updateClient.bind(null, id);

  const headerAction = (
    <a href={`/clients/${id}?tab=billing&new=invoice`} className="btn-new" style={{ textDecoration: 'none' }}>
      New invoice
    </a>
  );

  return (
    <Shell active="clients" title={client.name} crumb="Workspace · Clients" action={headerAction}>
      <div className="client-hero">
        <div>
          {client.company && <div style={{ fontSize: 14, fontWeight: 600 }}>{client.company}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
            <span className={`tag ${client.status === 'active' ? 'ontrack' : client.status === 'paused' ? 'review' : 'idea'}`}>
              {CLIENT_STATUS_LABEL[client.status] ?? 'Active'}
            </span>
            {workTypes.map((t) => (
              <span key={t} className="type-badge" style={{ color: WORK_TYPE_COLOR[t], borderColor: WORK_TYPE_COLOR[t] }}>
                <span className="type-dot" style={{ background: WORK_TYPE_COLOR[t] }} />{WORK_TYPE_LABEL[t]}
              </span>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            <ClientTime timezone={client.timezone} />
            {client.email && <> · {client.email}</>}
            {client.project_cost ? <> · {money(client.project_cost)} total project cost</> : null}
          </div>
        </div>
      </div>

      <div className={client.project_cost ? 'stat-row' : 'stat-row three'}>
        {client.project_cost ? (
          <div className="stat-box"><div className="lbl">Project cost</div><div className="val">{money(client.project_cost)}</div>
            <div className="text-muted" style={{ fontSize: 11.5 }}>
              {totals.invoiced >= client.project_cost ? 'Fully invoiced' : `${money(client.project_cost - totals.invoiced)} left to invoice`}
            </div>
          </div>
        ) : null}
        <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{money(totals.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Collected</div><div className="val" style={{ color: 'var(--sage)' }}>{money(totals.paid)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: 'var(--crimson)' }}>{money(totals.outstanding)}</div></div>
      </div>

      <div className="tab-row">
        {Object.entries(TABS).map(([key, label]) => (
          <a key={key} href={`/clients/${id}?tab=${key}`} className={activeTab === key ? 'active' : ''}>{label}</a>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid-2-eq">
          <div>
            <h4>Open work</h4>
            {openTasks.length === 0 ? (
              <p className="text-muted text-sm">Nothing open across their projects.</p>
            ) : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {openTasks.slice(0, 8).map((t) => (
                  <div key={t.id} className="list-row">
                    <span>{t.title}</span>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>{t.scheduled_date ?? 'unscheduled'}</span>
                  </div>
                ))}
              </div>
            )}

            <h4 style={{ marginTop: 22 }}>Next meeting</h4>
            {meetings.length === 0 ? (
              <p className="text-muted text-sm">Nothing on the books.</p>
            ) : (
              <div className="card">
                <strong>{meetings[0]!.title}</strong>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {fmtMeetingTime(meetings[0]!.starts_at, client.timezone).home} your time ·{' '}
                  {fmtMeetingTime(meetings[0]!.starts_at, client.timezone).theirs} theirs
                </div>
              </div>
            )}
          </div>

          <div>
            <h4>Projects</h4>
            {projects.length === 0 ? (
              <p className="text-muted text-sm">No projects linked to this client yet.</p>
            ) : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {projects.map((p) => (
                  <div key={p.id} className="list-row">
                    <a href={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                      <span className="type-dot" style={{ background: TYPE_COLOR[primaryType(p)] }} />{p.name}
                    </a>
                    <span className={`tag ${p.status}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}

            {client.notes && (
              <>
                <h4 style={{ marginTop: 22 }}>Notes</h4>
                <div className="card doc-pre" style={{ fontSize: 13 }}>{client.notes}</div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'work' && (
        <div>
          {tasks.length === 0 ? (
            <div className="card"><div className="empty"><div className="big">No tasks yet</div>Tasks on this client&apos;s projects show up here.</div></div>
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
                    <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--muted)' : 'inherit' }}>
                      {t.title}
                    </span>
                  </span>
                  <span className="text-muted" style={{ fontSize: 11.5 }}>{t.scheduled_date ?? 'unscheduled'}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted text-sm">
            Add tasks from the project itself or from Today — this view is the roll-up across
            everything you&apos;re doing for {client.name}.
          </p>
        </div>
      )}

      {activeTab === 'meetings' && (
        <div>
          {meetings.length === 0 && <p className="text-muted text-sm">No meetings recorded yet.</p>}
          {meetings.map((m) => {
            const times = fmtMeetingTime(m.starts_at, client.timezone);
            return (
              <div key={m.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{m.title}</strong>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {times.home} your time · {times.theirs} theirs · {m.duration_mins} min
                      {m.location ? ` · ${m.location}` : ''}
                    </div>
                  </div>
                  <ActionButton
                    action={async () => { 'use server'; await deleteMeeting(id, m.id); }}
                    className="btn-link"
                    confirm={`Delete "${m.title}"?`}
                    pendingLabel="…"
                  >
                    Delete
                  </ActionButton>
                </div>

                <form action={updateMeetingNotes.bind(null, id, m.id)} className="form-grid" style={{ maxWidth: '100%', marginTop: 10 }}>
                  <textarea name="notes" rows={3} defaultValue={m.notes ?? ''} placeholder="Agenda before, minutes after" />
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <input name="follow_up" defaultValue={m.follow_up ?? ''} placeholder="One follow-up action" />
                    <SubmitButton className="btn-inline" pendingLabel="Saving…">Save</SubmitButton>
                  </div>
                </form>

                {m.follow_up && (
                  <div style={{ marginTop: 8 }}>
                    <ActionButton
                      action={async () => { 'use server'; await followUpToTask(id, m.id); }}
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: '5px 11px' }}
                      pendingLabel="Adding…"
                    >
                      Turn follow-up into a task
                    </ActionButton>
                  </div>
                )}
              </div>
            );
          })}

          <div className="section-title"><h3>Log a meeting</h3></div>
          <form action={boundAddMeeting} className="form-grid" style={{ maxWidth: 520 }}>
            <input name="title" placeholder="What is it about? *" required />
            <div className="grid-2-eq">
              <div>
                <label className="field-label" htmlFor="starts_at">Starts (your time)</label>
                <input id="starts_at" name="starts_at" type="datetime-local" required style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label" htmlFor="duration_mins">Minutes</label>
                <input id="duration_mins" name="duration_mins" type="number" min={5} step={5} defaultValue={30} style={{ width: '100%' }} />
              </div>
            </div>
            <input name="location" placeholder="Meet link or place" />
            <select name="project_id" defaultValue="">
              <option value="">Not about a specific project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <textarea name="notes" rows={2} placeholder="Agenda" />
            <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Add meeting</SubmitButton>
          </form>
        </div>
      )}

      {activeTab === 'billing' && (
        <div>
          <div className="chip-row">
            <a href={`/clients/${id}?tab=billing&new=invoice`} className={creating === 'invoice' ? 'active' : ''}>+ Invoice</a>
            <a href={`/clients/${id}?tab=billing&new=quote`} className={creating === 'quote' ? 'active' : ''}>+ Quotation</a>
            {creating && <a href={`/clients/${id}?tab=billing`}>Close form</a>}
          </div>

          {(creating === 'invoice' || creating === 'quote') && (
            <DocForm
              kind={creating === 'invoice' ? 'invoice' : 'quote'}
              action={creating === 'invoice' ? createInvoiceAndOpen : createQuoteAndOpen}
              clients={[{ id: client.id, name: client.name, company: client.company, project_cost: client.project_cost }]}
              projects={allProjects.map((p) => ({ id: p.id, name: p.name }))}
              defaultTaxPct={settings.business.default_tax_pct}
              defaultClientId={client.id}
              defaultStream={workTypes.includes('teaching') ? 'teaching' : 'freelance'}
              defaultProjectCost={client.project_cost}
            />
          )}

          <div className="section-title"><h3>Invoices</h3></div>
          {invoices.length === 0 ? <p className="text-muted text-sm">Nothing invoiced yet.</p> : (
            <div className="table-wrap">
              <table className="docs">
                <thead><tr><th>Number</th><th>Stream</th><th>Issued</th><th>Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono"><a href={`/billing/invoices/${inv.id}`}>{inv.number}</a></td>
                      <td className="text-muted">{STREAM_LABEL[inv.stream] ?? '—'}</td>
                      <td className="mono">{inv.issued_at ?? '—'}</td>
                      <td className="mono">{money(grandTotal(inv))}</td>
                      <td><span className={`tag ${inv.status === 'paid' ? 'ontrack' : inv.status === 'overdue' ? 'risk' : inv.status === 'pending' ? 'review' : 'idea'}`}>{inv.status}</span></td>
                      <td>
                        {inv.status !== 'paid' && (
                          <ActionButton action={async () => { 'use server'; await markInvoicePaid(inv.id); }} className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }} pendingLabel="Saving…">
                            Mark paid
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title"><h3>Quotations</h3></div>
          {quotes.length === 0 ? <p className="text-muted text-sm">No quotations yet.</p> : (
            <div className="card" style={{ padding: '4px 18px' }}>
              {quotes.map((q) => (
                <div key={q.id} className="list-row">
                  <a href={`/billing/quotes/${q.id}`} className="mono" style={{ textDecoration: 'none' }}>{q.number}</a>
                  <span className="mono">{money(grandTotal(q))} <span className={`tag ${q.status === 'accepted' ? 'ontrack' : 'review'}`}>{q.status}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'notes' && (
        <div>
          {notes.length === 0 ? (
            <p className="text-muted text-sm">No notes linked to this client or their projects yet — create them in Notes &amp; SOPs.</p>
          ) : (
            <div className="card" style={{ padding: '4px 18px' }}>
              {notes.map((n) => (
                <div key={n.id} className="list-row">
                  <span>{n.title}</span>
                  <span className="mono text-muted" style={{ fontSize: 11.5 }}>{n.vault_path}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'skills' && (
        <SkillPanel
          title={`Skills for ${client.name}`}
          intro="Drafts built from this client's meetings, tasks and billing record."
          skills={skillCards('client')}
          clientId={id}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          run={runSkillAction}
        />
      )}

      {activeTab === 'portal' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h3>Client share link</h3>
          <p className="text-muted text-sm" style={{ marginTop: 0 }}>
            A read-only page {client.name} can open without an account: their projects, status,
            meetings and invoices. The link <em>is</em> the credential — anyone holding it can see
            this client&apos;s page, so share it directly and rotate it if it ever leaks.
          </p>

          {client.portal_token ? (
            <>
              <input readOnly value={`/portal/${client.portal_token}`} className="mono" style={{ width: '100%', marginBottom: 10 }} />
              <p className="text-muted" style={{ fontSize: 11.5, marginTop: 0 }}>
                Prefix it with your own domain when you send it.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href={`/portal/${client.portal_token}`} className="btn-ghost" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer">
                  Preview
                </a>
                <ActionButton action={async () => { 'use server'; await rotatePortalToken(id); }} className="btn-ghost" pendingLabel="Rotating…" confirm="Rotate the link? Any link you've already shared stops working.">
                  Rotate link
                </ActionButton>
                <ActionButton action={async () => { 'use server'; await revokePortalToken(id); }} className="btn-link" pendingLabel="Revoking…" confirm="Turn the portal off for this client?">
                  Turn off
                </ActionButton>
              </div>
            </>
          ) : (
            <ActionButton action={async () => { 'use server'; await rotatePortalToken(id); }} className="btn" pendingLabel="Creating…">
              Create share link
            </ActionButton>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div>
          <form action={boundUpdateClient} className="card form-grid" style={{ maxWidth: 560 }}>
            <div>
              <label className="field-label" htmlFor="name">Contact name</label>
              <input id="name" name="name" defaultValue={client.name} required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="company">Company</label>
              <input id="company" name="company" defaultValue={client.company ?? ''} style={{ width: '100%' }} />
            </div>
            <div className="grid-2-eq">
              <div>
                <label className="field-label" htmlFor="cemail">Email</label>
                <input id="cemail" name="email" defaultValue={client.email ?? ''} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label" htmlFor="cphone">Phone</label>
                <input id="cphone" name="phone" defaultValue={client.phone ?? ''} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="address">Billing address</label>
              <textarea id="address" name="address" rows={2} defaultValue={client.address ?? ''} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label">Time zone</label>
              <TimezoneSelect name="timezone" defaultValue={client.timezone} />
            </div>
            <div>
              <label className="field-label">Type of work</label>
              <WorkTypePicker initial={workTypes} />
            </div>
            <div className="grid-2-eq">
              <div>
                <label className="field-label" htmlFor="project_cost">Total project cost (₹)</label>
                <input id="project_cost" name="project_cost" type="number" min={0} defaultValue={client.project_cost ?? ''} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label" htmlFor="status">Relationship</label>
                <select id="status" name="status" defaultValue={client.status} style={{ width: '100%' }}>
                  {(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => (
                    <option key={s} value={s}>{CLIENT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" rows={3} defaultValue={client.notes ?? ''} style={{ width: '100%' }} />
            </div>
            <SubmitButton className="btn" pendingLabel="Saving…" style={{ width: 'fit-content' }}>Save changes</SubmitButton>
          </form>

          <div className="card danger-card" style={{ maxWidth: 560, marginTop: 18 }}>
            <h3 style={{ color: 'var(--crimson)' }}>Danger zone</h3>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
              Removes the client record. Their projects, invoices and meetings stay — they just
              stop pointing anywhere.
            </p>
            <form action={async () => { 'use server'; await deleteClientAndReturn(id); }}>
              <SubmitButton className="btn-danger" pendingLabel="Deleting…" confirm={`Delete ${client.name}?`}>
                Delete client
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
