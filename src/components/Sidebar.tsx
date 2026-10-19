import { getSessionEmail, getSessionDisplayName } from '@/lib/auth/session';
import { fieldHref, type Tag } from '@/features/tags/types';
import { getFieldsSafe } from '@/features/tags/queries';
import { TagIcon, iconKeyFor } from '@/features/tags/icons';

const ICONS: Record<string, React.ReactNode> = {
  today: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>),
  dashboard: (<><path d="M4 19a8 8 0 1116 0" /><path d="M12 19l4.5-6" /><circle cx="12" cy="19" r="1.2" /></>),
  projects: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>),
  audits: (<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5L15.5 10" /></>),
  tags: (<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>),
  products: (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17.5l9 5 9-5" /></>),
  goals: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>),
  clients: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.6" /><path d="M15 20c.3-2.6 1.9-4.5 4-5" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>),
  billing: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
  notes: (<><path d="M14 3v5a1 1 0 001 1h5" /><path d="M6 3h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M8 13h8M8 17h5" /></>),
  alerts: (<><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
  'daily-finance': (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="8" cy="14.5" r="1.4" /></>),
  'bounty-pipeline': (<><path d="M12 2l2.4 5.5L20 8.3l-4 4.1L17 18l-5-2.8L7 18l1-5.6-4-4.1 5.6-.8z" /></>),
  'reward-vault': (<><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M8 9V6a4 4 0 018 0v3" /></>),
  'learning-tracker': (<><path d="M4 6l8-3 8 3-8 3-8-3z" /><path d="M4 6v7c2 1.5 12 1.5 16 0V6" /></>),
  'release-stats': (<><path d="M4 19V10M10 19V4M16 19v-7M4 19h16" /></>),
  journal: (<><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" /><path d="M5 17a3 3 0 013-3h11" /><path d="M9 8h6" /></>),
};

const LINKS = [
  { href: '/today', label: 'Today', key: 'today', hint: 'g t' },
  { href: '/dashboard', label: 'Dashboard', key: 'dashboard', hint: 'g d' },
  { href: '/calendar', label: 'Calendar', key: 'calendar', hint: 'g a' },
  { href: '/projects', label: 'Projects', key: 'projects', hint: 'g p' },
  { href: '/products', label: 'Products', key: 'products', hint: 'g m' },
  { href: '/goals', label: 'Goals', key: 'goals', hint: 'g o' },
  { href: '/billing', label: 'Billing', key: 'billing', hint: 'g b' },
  { href: '/notes', label: 'Notes & SOPs', key: 'notes', hint: 'g n' },
];

/** Personal-ledger and side-project features — kept in their own nav group
 *  and off the Dashboard's main view, reached in one click but never
 *  competing with it for attention. See Dashboard's small "Elsewhere"
 *  strip for the equivalent non-distracting summary. */
const PERSONAL_LINKS = [
  { href: '/journal', label: 'Journal', key: 'journal' },
  { href: '/daily-finance', label: 'Daily Finance', key: 'daily-finance' },
  { href: '/bounty-pipeline', label: 'Bug Bounty Pipeline', key: 'bounty-pipeline' },
  { href: '/reward-vault', label: 'Reward Vault', key: 'reward-vault' },
  { href: '/learning-tracker', label: 'Learning Tracker', key: 'learning-tracker' },
  { href: '/release-stats', label: 'Release Stats', key: 'release-stats' },
];

export async function Sidebar({ active, alertCount = 0, fields: fieldsProp }: { active?: string; alertCount?: number; fields?: Tag[] }) {
  const ownerId = await getSessionEmail();
  if (!ownerId) return null;
  // Display identity, not the owner id — under Supabase those differ and
  // the owner id is a UUID, which is not a useful thing to show a person.
  const label = (await getSessionDisplayName()) ?? 'account';
  // The loading skeleton renders <Sidebar /> bare; load the fields here so the menu is identical before and after load.
  const fields = fieldsProp ?? (await getFieldsSafe(ownerId));

  return (
    <div id="sidebar">
      <div className="ws">
        <img className="ws-mark-img" src="/mascot/meri-sm.png" alt="" width={34} height={34} />
        <div>
          <div className="ws-name">Meridian</div>
          <div className="ws-sub">Studio workspace</div>
        </div>
      </div>

      <div className="nav-label">Workspace</div>
      <nav className="nav">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`nav-item${active === l.key ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS[l.key]}</svg>
            <span style={{ flex: 1 }}>{l.label}</span>
            <kbd className="kbd nav-kbd">{l.hint}</kbd>
          </a>
        ))}
      </nav>

      {/* Clients, then each field (SaaS, Gaming, Book Publishing, TPN Auditing, Bug Bounty, Digital Marketing…) —
          every one its own page with its own projects and yearly amount target. Before the tags table exists
          the dedicated pages stay reachable by hand-written links. */}
      <div className="nav-label">Clients &amp; fields</div>
      <nav className="nav">
        <a href="/clients" className={`nav-item${active === 'clients' ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS.clients}</svg>
          <span style={{ flex: 1 }}>Clients</span>
          <kbd className="kbd nav-kbd">g c</kbd>
        </a>
        {fields.map((f) => {
          const on = active === `field:${f.id}` || (f.special === 'tpn' && active === 'audits') || (f.special === 'bounty' && active === 'bounty-pipeline');
          return (
            <a key={f.id} href={fieldHref(f)} className={`nav-item${on ? ' active' : ''}`}>
              <span className="nav-icon"><TagIcon icon={iconKeyFor(f)} color={f.color} size={18} /></span>
              <span style={{ flex: 1 }}>{f.name}</span>
            </a>
          );
        })}
        {fields.length === 0 && (
          <a href="/tpn-audits" className={`nav-item${active === 'audits' ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS.audits}</svg>
            <span style={{ flex: 1 }}>TPN Audits</span>
          </a>
        )}
      </nav>

      <div className="nav-label">Personal</div>
      <nav className="nav">
        {PERSONAL_LINKS.filter((l) => !(l.key === 'bounty-pipeline' && fields.some((f) => f.special === 'bounty'))).map((l) => (
          <a key={l.href} href={l.href} className={`nav-item${active === l.key ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS[l.key]}</svg>
            <span style={{ flex: 1 }}>{l.label}</span>
          </a>
        ))}
      </nav>

      <div className="nav-label">Signals</div>
      <nav className="nav">
        <a href="/notifications" className={`nav-item${active === 'alerts' ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS.alerts}</svg>
          <span style={{ flex: 1 }}>Notifications</span>
          {alertCount > 0 && <span className="nav-count">{alertCount}</span>}
        </a>
      </nav>

      <div className="nav-label">Workspace setup</div>
      <nav className="nav">
        <a href="/settings" className={`nav-item${active === 'settings' ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS.settings}</svg>
          <span style={{ flex: 1 }}>Settings</span>
        </a>
        <a href="/tags" className={`nav-item${active === 'tags' ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{ICONS.tags}</svg>
          <span style={{ flex: 1 }}>Tags &amp; Fields</span>
        </a>
      </nav>

      <div className="sidebar-foot">
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          Press <kbd className="kbd">?</kbd> for shortcuts
        </div>
        <form method="POST" action="/api/auth/logout">
          <button type="submit" className="btn-link" style={{ color: 'var(--muted)' }}>
            Log out ({label})
          </button>
        </form>
      </div>
    </div>
  );
}
