import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getAlerts, getHiddenAlerts } from '@/features/notifications/queries';
import { dismissAlert, snoozeAlert, restoreAlert, markAllRead } from '@/features/notifications/actions';
import { Shell } from '@/components/Shell';

const LEVEL_LABEL: Record<string, string> = {
  critical: 'Needs attention', warning: 'Coming up', info: 'Worth a look',
};

export default async function NotificationsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const alerts = await getAlerts(email);
  const hidden = await getHiddenAlerts(email);
  const unreadKeys = alerts.filter((a) => !a.read).map((a) => a.id);

  const groups = (['critical', 'warning', 'info'] as const)
    .map((level) => ({ level, items: alerts.filter((a) => a.level === level) }))
    .filter((g) => g.items.length > 0);

  const action = unreadKeys.length > 0 ? (
    <form action={async () => { 'use server'; await markAllRead(unreadKeys); }}>
      <button type="submit" className="btn-ghost">Mark all read</button>
    </form>
  ) : null;

  return (
    <Shell active="alerts" title="Notifications" crumb="Workspace" action={action}>
      {alerts.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="big">All clear</div>
            Nothing overdue, nothing closing soon.
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.level}>
          <div className="section-title">
            <h3>{LEVEL_LABEL[g.level]}</h3>
            <span className="text-muted text-sm">{g.items.length}</span>
          </div>
          <div className="card" style={{ padding: '4px 18px' }}>
            {g.items.map((a) => (
              <div key={a.id} className="list-row">
                <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <span className={`bell-bar ${a.level}`} style={{ minHeight: 32 }} />
                  <span style={{ minWidth: 0 }}>
                    <a href={a.href} style={{ display: 'block', fontWeight: a.read ? 400 : 600, textDecoration: 'none', color: 'inherit' }}>
                      {!a.read && <span className="unread-dot" />}
                      {a.title}
                    </a>
                    <span className="text-muted" style={{ fontSize: 12 }}>{a.detail}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <form action={async () => { 'use server'; await snoozeAlert(a.id, 3); }}>
                    <button type="submit" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }}>Snooze 3d</button>
                  </form>
                  <form action={async () => { 'use server'; await dismissAlert(a.id); }}>
                    <button type="submit" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }}>Dismiss</button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {hidden.length > 0 && (
        <details style={{ marginTop: 28 }}>
          <summary style={{ cursor: 'pointer', fontFamily: "'Fraunces',serif", fontSize: 15 }}>
            Dismissed &amp; snoozed ({hidden.length})
          </summary>
          <div className="card" style={{ padding: '4px 18px', marginTop: 10 }}>
            {hidden.map((a) => (
              <div key={a.id} className="list-row">
                <span className="text-muted text-sm">
                  {a.title}
                  {a.snoozedUntil && !a.dismissed && ` · back ${new Date(a.snoozedUntil).toLocaleDateString()}`}
                </span>
                <form action={async () => { 'use server'; await restoreAlert(a.id); }}>
                  <button type="submit" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 9px' }}>Restore</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="section-title"><h3>How these work</h3></div>
      <div className="card text-sm text-muted">
        Alert content is derived live from your data — overdue or soon-due invoices, bounty
        disclosure windows, at-risk projects, long-running work, and a backed-up brain dump — so it
        can never go stale. Only your interaction (read, dismissed, snoozed) is stored, in the{' '}
        <code>alert_states</code> table. New rules go in{' '}
        <code>src/features/notifications/queries.ts</code>.
      </div>
    </Shell>
  );
}
