import type { FetchedMetric } from './github';

// config.package is the npm package name, e.g. "@syntheui/colors"
export async function fetchNpmMetrics(config: Record<string, string>): Promise<FetchedMetric[]> {
  const pkg = config.package;
  if (!pkg) throw new Error('npm integration is missing a "package" name in its config.');

  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`npm package "${pkg}" not found.`);
    throw new Error(`npm registry error: ${res.status}`);
  }
  const data = await res.json();
  const latest = data['dist-tags']?.latest ?? '—';

  return [
    { label: 'Latest version', value: latest, delta: null },
    { label: 'Published', value: (data.time?.[latest] ?? '').slice(0, 10) || '—', delta: null },
  ];
}
