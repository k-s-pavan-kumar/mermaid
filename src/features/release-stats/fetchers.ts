import type { Platform } from './types';

export interface FetchResult {
  ok: boolean;
  /** Fatal reason — the platform's own numbers could not be pulled. */
  error?: string;
  /** Non-fatal — numbers came through but something optional (stars) didn't. */
  note?: string;
  stars?: number | null;
  downloads_30d?: number | null;
  installs?: number | null;
  rating?: number | null;
  review_count?: number | null;
}

const TIMEOUT_MS = 10_000;

class FetchError extends Error {}

async function getJson(url: string, init: RequestInit = {}): Promise<{ res: Response; data: any }> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new FetchError(/timeout|abort/i.test(msg) ? 'request timed out' : `network error (${msg})`);
  }
  let data: any = null;
  if (res.ok) {
    try { data = await res.json(); } catch { throw new FetchError('unexpected response (not JSON)'); }
  }
  return { res, data };
}

// ───────────────────────── GitHub ─────────────────────────

/** Accepts "owner/repo", https://github.com/owner/repo(.git), git+https://… */
export function normalizeRepo(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(?:git\+)?(?:https?:\/\/|git@)?(?:www\.)?(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    // GitHub rejects requests without a User-Agent.
    'User-Agent': 'meridian-release-stats',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function githubError(res: Response, repo: string): string {
  if (res.status === 401) return 'GITHUB_TOKEN is invalid or expired';
  if (res.status === 404) return `repo "${repo}" not found${process.env.GITHUB_TOKEN ? ' (token may lack access to it)' : ' — private repos need GITHUB_TOKEN'}`;
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    return `GitHub rate limit hit${process.env.GITHUB_TOKEN ? '' : ' — set GITHUB_TOKEN to raise it from 60/hr'}`;
  }
  return `GitHub API error ${res.status}`;
}

export async function fetchGithubRepo(repoInput: string): Promise<{ stars: number; releaseDownloads: number | null }> {
  const repo = normalizeRepo(repoInput);
  if (!repo) throw new FetchError(`"${repoInput}" isn't a valid owner/repo`);

  const { res, data } = await getJson(`https://api.github.com/repos/${repo}`, { headers: githubHeaders() });
  if (!res.ok) throw new FetchError(githubError(res, repo));
  const stars = Number(data?.stargazers_count ?? 0);

  // Release-asset downloads are the only download number GitHub exposes.
  // Optional: failure here never fails the sync.
  let releaseDownloads: number | null = null;
  try {
    const rel = await getJson(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: githubHeaders() });
    if (rel.res.ok && Array.isArray(rel.data)) {
      releaseDownloads = rel.data.reduce(
        (n: number, r: any) => n + (r.assets ?? []).reduce((m: number, a: any) => m + (a.download_count ?? 0), 0), 0);
    }
  } catch { /* optional */ }
  return { stars, releaseDownloads };
}

/** Stars from the optional linked repo; returns a note instead of throwing. */
async function starsFromRepo(repoInput: string | null | undefined): Promise<{ stars?: number; note?: string }> {
  if (!repoInput) return {};
  try {
    return { stars: (await fetchGithubRepo(repoInput)).stars };
  } catch (e) {
    return { note: `Stars unavailable: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
}

// ───────────────────────── npm ─────────────────────────

async function fetchNpm(name: string, githubRepo: string | null): Promise<FetchResult> {
  // downloads API wants the slash in @scope/name unescaped; the registry
  // wants it escaped (%2F).
  const dl = await getJson(`https://api.npmjs.org/downloads/point/last-month/${encodeURI(name)}`);
  if (!dl.res.ok) {
    return { ok: false, error: dl.res.status === 404 ? `npm package "${name}" not found` : `npm downloads API error ${dl.res.status}` };
  }

  // Stars: explicit linked repo wins, else read `repository` off the latest manifest.
  let repo: string | null = githubRepo;
  let note: string | undefined;
  if (!repo) {
    try {
      const meta = await getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`);
      const url = meta.res.ok ? (typeof meta.data?.repository === 'string' ? meta.data.repository : meta.data?.repository?.url) : null;
      repo = normalizeRepo(url);
      if (!repo) note = 'Stars unavailable: no GitHub repo in package.json — link one with "GitHub repo"';
    } catch { note = 'Stars unavailable: npm registry lookup failed'; }
  }
  const s = await starsFromRepo(repo);
  return { ok: true, downloads_30d: dl.data?.downloads ?? null, stars: s.stars ?? null, note: s.note ?? note };
}

// ───────────────────────── PyPI ─────────────────────────

async function fetchPypi(name: string, githubRepo: string | null): Promise<FetchResult> {
  const info = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!info.res.ok) {
    return { ok: false, error: info.res.status === 404 ? `PyPI project "${name}" not found` : `PyPI API error ${info.res.status}` };
  }

  let note: string | undefined;
  let downloads: number | null = null;
  try {
    const st = await getJson(`https://pypistats.org/api/packages/${encodeURIComponent(name.toLowerCase())}/recent`);
    if (st.res.ok) downloads = st.data?.data?.last_month ?? null;
    else note = `Downloads unavailable: pypistats returned ${st.res.status}`;
  } catch (e) { note = `Downloads unavailable: ${e instanceof Error ? e.message : 'pypistats unreachable'}`; }

  let repo: string | null = githubRepo;
  if (!repo) {
    const urls: string[] = [...Object.values<string>(info.data?.info?.project_urls ?? {}), info.data?.info?.home_page ?? ''];
    repo = normalizeRepo(urls.find((u) => /github\.com/i.test(u)));
  }
  const s = await starsFromRepo(repo);
  return { ok: true, downloads_30d: downloads, stars: s.stars ?? null, note: note ?? s.note };
}

// ───────────────────────── GitHub (as the platform) ─────────────────────────

async function fetchGithubPlatform(repo: string): Promise<FetchResult> {
  try {
    const r = await fetchGithubRepo(repo);
    return { ok: true, stars: r.stars, installs: r.releaseDownloads };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'GitHub sync failed' };
  }
}

// ───────────────────────── VS Code Marketplace ─────────────────────────

async function fetchVscode(extensionId: string, githubRepo: string | null): Promise<FetchResult> {
  if (!/^[\w-]+\.[\w.-]+$/.test(extensionId)) {
    return { ok: false, error: 'Extension ID must look like "publisher.extension-name"' };
  }
  const { res, data } = await getJson('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=3.0-preview.1' },
    // filterType 7 = ExtensionName; flags 914 = include statistics + versions
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: extensionId }] }], flags: 914 }),
  });
  if (!res.ok) return { ok: false, error: `VS Code Marketplace error ${res.status}` };

  const ext = data?.results?.[0]?.extensions?.[0];
  if (!ext) return { ok: false, error: `Extension "${extensionId}" not found on the Marketplace` };

  const stat = (n: string): number | null => {
    const v = (ext.statistics ?? []).find((s: any) => s.statisticName === n)?.value;
    return typeof v === 'number' ? v : null;
  };
  const s = await starsFromRepo(githubRepo);
  return {
    ok: true,
    installs: stat('install'),
    rating: stat('averagerating') !== null ? Math.round((stat('averagerating') as number) * 10) / 10 : null,
    review_count: stat('ratingcount'),
    stars: s.stars ?? null,
    note: s.note,
  };
}

// ───────────────────────── dispatcher ─────────────────────────

export const AUTO_PLATFORMS: Platform[] = ['npm', 'pypi', 'github', 'vscode_marketplace'];

/** Returns null for manual platforms with no linked repo — nothing to sync. */
export async function fetchPlatformMetrics(p: {
  platform: Platform; platform_identifier: string; github_repo: string | null;
}): Promise<FetchResult | null> {
  const repo = normalizeRepo(p.github_repo);
  try {
    switch (p.platform) {
      case 'npm': return await fetchNpm(p.platform_identifier, repo);
      case 'pypi': return await fetchPypi(p.platform_identifier, repo);
      case 'github': return await fetchGithubPlatform(p.platform_identifier);
      case 'vscode_marketplace': return await fetchVscode(p.platform_identifier, repo);
      default: {
        // figma_plugin / snapchat_lens / chrome_web_store / saas: no public
        // API. Only the optional linked GitHub repo can sync.
        if (!repo) return null;
        const s = await starsFromRepo(repo);
        return s.stars !== undefined ? { ok: true, stars: s.stars } : { ok: false, error: s.note };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'sync failed' };
  }
}
