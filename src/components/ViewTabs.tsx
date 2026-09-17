/**
 * The Today / Dashboard switch that sits in the topbar.
 *
 * Two views of the same records at two different distances: Today is the
 * working surface you land on after login and stay on all day; Dashboard is
 * the step back — weekly and monthly targets, where the 24 hours went, and
 * how the financial year is tracking. Deliberately a switch in the chrome
 * rather than another sidebar entry, because these two are a pair and
 * everything in the sidebar is a separate place.
 *
 * Plain links, not client-side state, so the active view survives a reload
 * and each view can be a server component that fetches only its own data.
 */
const VIEWS = [
  { key: 'today', href: '/today', label: 'Today' },
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
] as const;

export type ViewKey = (typeof VIEWS)[number]['key'];

export function ViewTabs({ active }: { active: ViewKey }) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Today or Dashboard">
      {VIEWS.map((v) => (
        <a
          key={v.key}
          href={v.href}
          role="tab"
          aria-selected={active === v.key}
          className={`view-tab${active === v.key ? ' active' : ''}`}
        >
          {v.label}
        </a>
      ))}
    </div>
  );
}
