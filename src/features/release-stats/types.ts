/**
 * Stars, downloads and installs across everything shipped — pulled from
 * each platform's own public API, never typed in. A "package" here can be a
 * family with sub-packages (Syntheui's four npm packages) or a single
 * standalone listing (a Chrome extension, a Hugo theme).
 */
export type Platform = 'npm' | 'pypi' | 'github' | 'chrome_web_store';

export interface TrackedPackage {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  emoji_icon: string;
  platform: Platform;
  /** npm package name / PyPI project name / "owner/repo" for GitHub /
   *  Chrome extension id — whatever that platform's API needs to look it
   *  up. */
  platform_identifier: string;
  /** A family like Syntheui is one TrackedPackage per sub-package, grouped
   *  under a shared `family` label in the UI — not a nested structure, so
   *  each sub-package still syncs and fails independently. */
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
  /** Did this snapshot come from a real API call, or is it the last known
   *  good value being carried forward because the source was briefly
   *  unreachable? The card marks the latter as stale rather than showing a
   *  false zero. */
  fetch_ok: boolean;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  npm: 'npm', pypi: 'PyPI', github: 'GitHub', chrome_web_store: 'Chrome Web Store',
};
