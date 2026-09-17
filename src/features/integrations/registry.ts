import { fetchGithubMetrics, type FetchedMetric } from './providers/github';
import { fetchPypiMetrics } from './providers/pypi';
import { fetchNpmMetrics } from './providers/npm';
import type { Integration } from './types';

export const PROVIDERS: Record<Integration['provider'], (config: Record<string, string>) => Promise<FetchedMetric[]>> = {
  github: fetchGithubMetrics,
  pypi: fetchPypiMetrics,
  npm: fetchNpmMetrics,
};
