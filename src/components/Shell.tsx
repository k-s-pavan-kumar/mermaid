import type { ReactNode } from 'react';
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
import { ViewTabs, type ViewKey } from './ViewTabs';

// The OS chrome: sidebar + topbar (with notifications) + live world-clock
// strip + scrolling content, plus the global keyboard layer. Every
// authenticated page renders inside this.
export async function Shell({
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
  const email = await getSessionEmail();
  const [alerts, projects, clients, settings] = email
    ? await Promise.all([getAlerts(email), getProjects(), getClients(email), getSettings(email)])
    : [[], [], [], null];

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
    { label: 'Daily Finance', href: '/daily-finance', group: 'Personal', hint: 'g f' },
    { label: 'Bug Bounty Pipeline', href: '/bounty-pipeline', group: 'Personal', hint: 'g u' },
    { label: 'Reward Vault', href: '/reward-vault', group: 'Personal', hint: 'g v' },
    { label: 'Learning Tracker', href: '/learning-tracker', group: 'Personal', hint: 'g l' },
    { label: 'Release Stats', href: '/release-stats', group: 'Personal', hint: 'g r' },
    ...projects.map((p) => ({ label: p.name, href: `/projects/${p.id}`, group: 'Project' })),
    ...clients.map((c) => ({ label: c.name, href: `/clients/${c.id}`, group: 'Client' })),
  ];

  return (
    <div className="os">
      <Sidebar active={active} alertCount={alerts.length} />
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
            <NotificationBell alerts={alerts} />
          </div>
        </div>
        <ClockStrip clocks={settings?.clocks ?? []} />
        <div className="content">{children}</div>
      </div>
      <CommandPalette items={items} />
      {email && <AssistantPanel />}
    </div>
  );
}
