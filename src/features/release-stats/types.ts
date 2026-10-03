/**
 * Stars, downloads, installs and (for SaaS) users + MRR across everything
 * shipped. Registries with a public API are pulled automatically; platforms
 * with no public API (Figma, Snapchat, Chrome Web Store, SaaS) are entered by
 * hand with "Update numbers" — and keep their last values rather than
 * showing a false zero.
 *
 * A "package" can be a family with sub-packages (Syntheui's four npm
 * packages) or a single standalone listing.
 */
export type Platform =
  | 'npm'
  | 'pypi'
  | 'github'
  | 'vscode_marketplace'
  | 'figma_plugin'
  | 'snapchat_lens'
  | 'chrome_web_store'
  | 'saas';

export type ManualField = 'installs' | 'rating' | 'review_count' | 'users' | 'mrr';

export interface PlatformMeta {
  label: string;
  group: 'Registries (auto-sync)' | 'Marketplaces' | 'Products';
  /** true → a public API exists and "Sync now" pulls real numbers. */
  auto: boolean;
  identifierLabel: string;
  identifierPlaceholder: string;
  /** Label for the second headline number on the card. */
  installsLabel: string;
  /** Which numbers you type in for manual platforms. */
  manualFields: ManualField[];
  /** Can send first-party events through the Meridian SDK. */
  sdk: boolean;
  /** What an 'open' event means on this platform — never called "downloads". */
  opensLabel: string;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  npm: {
    label: 'npm', group: 'Registries (auto-sync)', auto: true,
    identifierLabel: 'Package name', identifierPlaceholder: '@scope/name',
    installsLabel: 'Downloads (30d)', manualFields: [],
    sdk: false, opensLabel: 'Opens',
  },
  pypi: {
    label: 'PyPI', group: 'Registries (auto-sync)', auto: true,
    identifierLabel: 'Project name', identifierPlaceholder: 'archivehunter',
    installsLabel: 'Downloads (30d)', manualFields: [],
    sdk: false, opensLabel: 'Opens',
  },
  github: {
    label: 'GitHub', group: 'Registries (auto-sync)', auto: true,
    identifierLabel: 'Repo', identifierPlaceholder: 'owner/repo',
    installsLabel: 'Release downloads', manualFields: [],
    sdk: false, opensLabel: 'Opens',
  },
  vscode_marketplace: {
    label: 'VS Code Marketplace', group: 'Marketplaces', auto: true,
    identifierLabel: 'Extension ID', identifierPlaceholder: 'publisher.extension-name',
    installsLabel: 'Installs', manualFields: [],
    sdk: false, opensLabel: 'Opens',
  },
  figma_plugin: {
    label: 'Figma plugin', group: 'Marketplaces', auto: false,
    identifierLabel: 'Community URL (optional)', identifierPlaceholder: 'https://www.figma.com/community/plugin/…',
    installsLabel: 'Users', manualFields: ['installs', 'rating', 'review_count'],
    sdk: true, opensLabel: 'Plugin opens',
  },
  snapchat_lens: {
    label: 'Snapchat Lens', group: 'Marketplaces', auto: false,
    identifierLabel: 'Lens URL (optional)', identifierPlaceholder: 'https://www.snapchat.com/lens/…',
    installsLabel: 'Lens plays', manualFields: ['installs'],
    sdk: true, opensLabel: 'Lens plays',
  },
  chrome_web_store: {
    label: 'Chrome Web Store', group: 'Marketplaces', auto: false,
    identifierLabel: 'Extension ID / URL (optional)', identifierPlaceholder: 'abcdefghijklmnop…',
    installsLabel: 'Users', manualFields: ['installs', 'rating', 'review_count'],
    sdk: true, opensLabel: 'Extension opens',
  },
  saas: {
    label: 'SaaS product', group: 'Products', auto: false,
    identifierLabel: 'Product URL (optional)', identifierPlaceholder: 'https://app.example.com',
    installsLabel: 'Active users', manualFields: ['users', 'mrr'],
    sdk: true, opensLabel: 'Sessions',
  },
};

export const PLATFORM_LABEL: Record<Platform, string> = Object.fromEntries(
  (Object.keys(PLATFORM_META) as Platform[]).map((p) => [p, PLATFORM_META[p].label]),
) as Record<Platform, string>;

export const PLATFORMS = Object.keys(PLATFORM_META) as Platform[];

export interface TrackedPackage {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  emoji_icon: string;
  platform: Platform;
  /** npm name / PyPI name / "owner/repo" / VS Code "publisher.extension" —
   *  whatever that platform's API needs. For manual platforms this is just
   *  the listing URL or id, and may be empty. */
  platform_identifier: string;
  /** Optional "owner/repo" — lets ANY product (npm, Figma, SaaS…) pull its
   *  GitHub stars even when the platform itself has no stars. */
  github_repo: string | null;
  /** Public, write-only token the SDK sends with every event batch. Null =
   *  SDK not enabled for this product. Rotatable. */
  ingest_key: string | null;
  /** When the SDK last delivered an event (null = never). */
  last_event_at: string | null;
  /** A family like Syntheui is one TrackedPackage per sub-package, grouped
   *  under a shared `family` label in the UI. */
  family: string | null;
  created_at: string;
}

export interface MetricSnapshot {
  id: string;
  owner_id: string;
  package_id: string;
  captured_at: string; // ISO timestamp
  stars: number | null;
  downloads_30d: number | null;
  installs: number | null;
  rating: number | null;
  review_count: number | null;
  /** SaaS: active / total users. */
  users: number | null;
  /** SaaS: monthly recurring revenue, in the owner's currency. */
  mrr: number | null;
  /** SDK: 'open' events in the last 30 days (plugin opens / lens plays / sessions). */
  opens_30d: number | null;
  /** SDK: % of the 30-day active users who came back on 2+ different days. */
  return_rate: number | null;
  /** 'auto' = pulled from an API, 'manual' = typed in, 'sdk' = our SDK. */
  source: 'auto' | 'manual' | 'sdk';
  /** Did this snapshot come from a real API call (or a manual entry), or is
   *  it the last known good value carried forward because the source was
   *  unreachable? Carried-forward snapshots are shown as stale. */
  fetch_ok: boolean;
  /** Why a sync failed, or a partial-failure note (e.g. "stars unavailable").
   *  Shown on the card so a stale tag is never a mystery. */
  fetch_error: string | null;
}
