export interface FetchedMetric {
  label: string;
  value: string;
  delta: string | null;
}

// config.repo should be "owner/name", e.g. "k-s-pavan-kumar/hugo-nimbus"
export async function fetchGithubMetrics(config: Record<string, string>): Promise<FetchedMetric[]> {
  const repo = config.repo;
  if (!repo) throw new Error('GitHub integration is missing a "repo" (owner/name) in its config.');

  const headers: Record<string, string> = { 'User-Agent': 'meridian-app' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers, cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`GitHub repo "${repo}" not found (or private).`);
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data = await res.json();

  return [
    { label: 'GitHub stars', value: String(data.stargazers_count), delta: null },
    { label: 'Open issues', value: String(data.open_issues_count), delta: null },
    { label: 'Latest push', value: new Date(data.pushed_at).toISOString().slice(0, 10), delta: null },
  ];
}
