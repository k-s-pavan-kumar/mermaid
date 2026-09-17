import { notFound } from 'next/navigation';
import { getClientByToken, getClientWorkspace } from '@/features/clients/queries';
import { getSettings } from '@/features/settings/queries';
import { grandTotal } from '@/features/billing/types';

const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/**
 * The client-facing view. No login, no session — the token in the URL is the
 * only key, which is why it's long, rotatable and scoped to exactly one
 * client. This page is READ ONLY by design: it renders from the same records
 * the workspace does and exposes no action, so there is nothing here for a
 * leaked link to change.
 */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await getClientByToken(token);
  if (!client) notFound();

  const workspace = await getClientWorkspace(client.id);
  if (!workspace) notFound();

  const settings = await getSettings(client.owner_id);
  const { projects, meetings, invoices, money: totals } = workspace;
  const upcoming = meetings.filter((m) => new Date(m.starts_at) >= new Date()).reverse();

  return (
    <div className="portal">
      <header className="portal-head">
        <div>
          <div className="text-muted" style={{ fontSize: 12 }}>{settings.business.legal_name || 'Project portal'}</div>
          <h1 style={{ margin: '2px 0 0' }}>{client.company || client.name}</h1>
        </div>
        <img src="/mascot/idle.png" alt="" width={64} height={64} />
      </header>

      <section className="stat-row three">
        <div className="stat-box"><div className="lbl">Projects</div><div className="val">{projects.length}</div></div>
        <div className="stat-box"><div className="lbl">Invoiced</div><div className="val">{money(totals.invoiced)}</div></div>
        <div className="stat-box"><div className="lbl">Outstanding</div><div className="val" style={{ color: 'var(--crimson)' }}>{money(totals.outstanding)}</div></div>
      </section>

      <h3>Projects</h3>
      {projects.length === 0 ? (
        <p className="text-muted text-sm">No active projects.</p>
      ) : (
        <div className="card" style={{ padding: '4px 18px' }}>
          {projects.map((p) => (
            <div key={p.id} className="list-row">
              <span>
                <strong>{p.name}</strong>
                {p.description && <div className="text-muted" style={{ fontSize: 12 }}>{p.description}</div>}
              </span>
              <span className={`tag ${p.status}`}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 26 }}>Upcoming meetings</h3>
      {upcoming.length === 0 ? (
        <p className="text-muted text-sm">Nothing scheduled.</p>
      ) : (
        <div className="card" style={{ padding: '4px 18px' }}>
          {upcoming.map((m) => (
            <div key={m.id} className="list-row">
              <span>{m.title}</span>
              <span className="mono text-muted" style={{ fontSize: 12 }}>
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  hour12: false, timeZone: client.timezone,
                }).format(new Date(m.starts_at))}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 26 }}>Invoices</h3>
      {invoices.filter((i) => i.status !== 'draft').length === 0 ? (
        <p className="text-muted text-sm">Nothing issued yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="docs">
            <thead><tr><th>Number</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.filter((i) => i.status !== 'draft').map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.number}</td>
                  <td className="mono">{inv.issued_at ?? '—'}</td>
                  <td className="mono">{inv.due_at ?? '—'}</td>
                  <td className="mono">{money(grandTotal(inv))}</td>
                  <td><span className={`tag ${inv.status === 'paid' ? 'ontrack' : inv.status === 'overdue' ? 'risk' : 'review'}`}>{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="portal-foot">
        Questions? Reply to {settings.business.email || 'the email this link came from'}.
      </footer>
    </div>
  );
}
