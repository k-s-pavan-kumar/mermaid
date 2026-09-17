import type { FetchedMetric } from './github';

// config.package is the PyPI project name, e.g. "archivehunter"
export async function fetchPypiMetrics(config: Record<string, string>): Promise<FetchedMetric[]> {
  const pkg = config.package;
  if (!pkg) throw new Error('PyPI integration is missing a "package" name in its config.');

  const res = await fetch(`https://pypi.org/pypi/${pkg}/json`, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`PyPI package "${pkg}" not found.`);
    throw new Error(`PyPI API error: ${res.status}`);
  }
  const data = await res.json();

  return [
    { label: 'Latest version', value: data.info.version, delta: null },
    { label: 'License', value: data.info.license || '—', delta: null },
    // PyPI's own JSON API doesn't include download counts — that needs
    // pypistats.org's API separately. Left out here rather than faked;
    // wire it in the same shape as this function if you want it.
  ];
}
