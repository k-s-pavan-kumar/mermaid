import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getClients } from '@/features/clients/queries';
import { createClient } from '@/features/clients/actions';
import { CLIENT_STATUS_LABEL, WORK_TYPE_COLOR, WORK_TYPE_LABEL, clientWorkTypes, type ClientStatus } from '@/features/clients/types';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { WorkTypePicker } from '@/features/clients/components/WorkTypePicker';
import { ClientTime } from '@/features/clients/components/ClientTime';

const STATUS_TAG: Record<ClientStatus, string> = { active: 'ontrack', paused: 'review', past: 'idea', lead: 'done' };

export default async function ClientsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const clients = await getClients(email);

  return (
    <Shell active="clients" title="Clients" crumb="Workspace">
      {clients.length === 0 ? (
        <div className="card">
          <div className="empty">
            <img src="/mascot/search.png" alt="" width={84} height={84} />
            <div className="big">No clients yet</div>
            Add your first one below. Each client gets their own workspace — projects,
            meetings, notes, invoices and a share link, all in one place.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '4px 18px' }}>
          {clients.map((c) => (
            <div key={c.id} className="list-row">
              <div style={{ minWidth: 0 }}>
                <a href={`/clients/${c.id}`} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{c.name}</a>
                {c.company && <span className="text-muted" style={{ fontSize: 12.5 }}> · {c.company}</span>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 3 }}>
                  {clientWorkTypes(c).map((t) => (
                    <span key={t} className="text-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                      <span className="type-dot" style={{ background: WORK_TYPE_COLOR[t] }} />{WORK_TYPE_LABEL[t]}
                    </span>
                  ))}
                </div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <ClientTime timezone={c.timezone} />
                <span className={`tag ${STATUS_TAG[c.status] ?? 'idea'}`}>{CLIENT_STATUS_LABEL[c.status] ?? 'Active'}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="section-title"><h3>Add a client</h3></div>
      <form action={createClient} className="form-grid" style={{ maxWidth: 560 }}>
        <input name="name" placeholder="Contact name *" required />
        <input name="company" placeholder="Company" />
        <div className="grid-2-eq">
          <input name="email" type="email" placeholder="Email" />
          <input name="phone" placeholder="Phone" />
        </div>
        <textarea name="address" rows={2} placeholder="Billing address — printed on their invoices" />
        <div>
          <label className="field-label">Time zone</label>
          <TimezoneSelect name="timezone" defaultValue="Asia/Kolkata" />
        </div>
        <div>
          <label className="field-label">Type of work</label>
          <WorkTypePicker />
        </div>
        <div className="grid-2-eq">
          <div>
            <label className="field-label" htmlFor="rate">Agreed rate (₹)</label>
            <input id="rate" name="rate" type="number" min={0} step="1" placeholder="e.g. 1500 per hour" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="status">Relationship</label>
            <select id="status" name="status" defaultValue="active" style={{ width: '100%' }}>
              {(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => (
                <option key={s} value={s}>{CLIENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <textarea name="notes" rows={2} placeholder="Anything worth remembering before the next call" />
        <SubmitButton className="btn" pendingLabel="Adding…" style={{ width: 'fit-content' }}>Add client</SubmitButton>
      </form>
    </Shell>
  );
}
