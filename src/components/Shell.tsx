import { Suspense, cache, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ClockStrip } from './ClockStrip';
import { CommandPalette, type PaletteItem } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { getSessionEmail } from '@/lib/auth/session';
import { getAlerts } from '@/features/notifications/queries';
import { getProjects } from '@/features/projects/queries';
import { getClients } from '@/features/clients/queries';
import { getSettings } from '@/features/settings/queries';
import { AssistantPanel } from './AssistantPanel';
import { JournalReminders } from './JournalReminders';
import { ViewTabs, type ViewKey } from './ViewTabs';

// Per-request memo so the sidebar badge and the bell share one derived-alerts
// computation instead of each running it.
const alertsFor = cache((owner: string) => getAlerts(owner));

async function SidebarLive({ active }: { active?: string }) {
  const email = await getSessionEmail();
  const alerts = email ? await alertsFor(email) : [];
  return <Sidebar active={active} alertCount={alerts.length} />;
}

async function BellLive() {
  const email = await getSessionEmail();
  const alerts = email ? await alertsFor(email) : [];
  return <NotificationBell alerts={alerts} />;
}

async function ClocksLive() {
  const email = await getSessionEmail();
  const settings = email ? await getSettings(email) : null;
  return <ClockStrip clocks={settings?.clocks ?? []} />;
}

async function PaletteLive() {
  const email = await getSessionEmail();
  const [projects, clients] = email ? await Promise.all([getProjects(), getClients(email)]) : [[], []];

  // Palette entries: fixed pages plus everything the user has actually created,
  // so ⌘K reaches real records, not just nav.
  const items: PaletteItem[] = [
    { label: 'Today', href: '/today', group: 'Page', hint: 'g t' },
    { label: 'Dashboard — targets, time split & financial goal', href: '/dashboard', group: 'Page', hint: 'g d' },
    { label: 'Projects', href: '/projects', group: 'Page', hint: 'g p' },
    { label: 'Clients', href: '/clients', group: 'Page', hint: 'g c' },
    { label: 'Calendar', href: '/calendar', group: 'Page', hint: 'g a' },
    { label: 'Billing — invoices & quotes', href: '/billing', group: 'Page', hint: 'g b' },
    { label: 'Notes & SOPs', href: '/notes', group: 'Page', hint: 'g n' },
    { label: 'Settings', href: '/settings', group: 'Page' },
    { label: 'Notifications', href: '/notifications', group: 'Page' },
    { label: 'Journal — daily personal notes', href: '/journal', group: 'Personal', hint: 'g j' },
    { label: 'Daily Finance', href: '/daily-finance', group: 'Personal', hint: 'g f' },
    { label: 'Daily Finance — Dues tracker', href: '/daily-finance/dues', group: 'Personal' },
    { label: 'Daily Finance — Investments', href: '/daily-finance/investments', group: 'Personal' },
    { label: 'Bug Bounty Pipeline', href: '/bounty-pipeline', group: 'Personal', hint: 'g u' },
    { label: 'Reward Vault', href: '/reward-vault', group: 'Personal', hint: 'g v' },
    { label: 'Learning Tracker', href: '/learning-tracker', group: 'Personal', hint: 'g l' },
    { label: 'Release Stats', href: '/release-stats', group: 'Personal', hint: 'g r' },
    ...projects.map((p) => ({ label: p.name, href: `/projects/${p.id}`, group: 'Project' })),
    ...clients.map((c) => ({ label: c.name, href: `/clients/${c.id}`, group: 'Client' })),
  ];
  return <CommandPalette items={items} />;
}

async function ExtrasLive() {
  const email = await getSessionEmail();
  if (!email) return null;
  return (
    <>
      <AssistantPanel />
      <JournalReminders />
    </>
  );
}

// The OS chrome: sidebar + topbar (with notifications) + live world-clock
// strip + scrolling content, plus the global keyboard layer. Every
// authenticated page renders inside this.
//
// Everything that needs its own data (alerts, settings, palette records) is
// wrapped in <Suspense> so the page content streams immediately instead of
// waiting for the chrome's queries — those used to run AFTER the page's own
// queries, stacking the two delays.
export function Shell({
  active, title, crumb, action, view, children,
}: {
  active?: string;
  title: string;
  crumb?: string;
  action?: ReactNode;
  /** Renders the Today / Dashboard switch in the topbar when set. */
  view?: ViewKey;
  children: ReactNode;
}) {
  return (
    <div className="os">
      <Suspense fallback={<Sidebar active={active} />}>
        <SidebarLive active={active} />
      </Suspense>
      <div className="main">
        <div className="topbar">
          <div className="topbar-lead">
            <div>
              {crumb && <div className="crumb">{crumb}</div>}
              <h1>{title}</h1>
            </div>
            {view && <ViewTabs active={view} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {action}
            <button className="btn-ghost kbd-hint" title="Press ⌘K">⌘K</button>
            <Suspense fallback={null}>
              <BellLive />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<ClockStrip clocks={[]} />}>
          <ClocksLive />
        </Suspense>
        <div className="content">{children}</div>
      </div>
      <Suspense fallback={null}>
        <PaletteLive />
      </Suspense>
      <Suspense fallback={null}>
        <ExtrasLive />
      </Suspense>
    </div>
  );
}
