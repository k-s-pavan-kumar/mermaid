export interface Integration {
  id: string;
  owner_id: string;
  project_id: string;
  provider: 'github' | 'pypi' | 'npm';
  config: Record<string, string>;
  last_synced_at: string | null;
}

export const PROVIDER_LABEL: Record<Integration['provider'], string> = {
  github: 'GitHub',
  pypi: 'PyPI',
  npm: 'npm',
};

export const PROVIDER_CONFIG_FIELD: Record<Integration['provider'], { key: string; label: string; placeholder: string }> = {
  github: { key: 'repo', label: 'Repo', placeholder: 'owner/name' },
  pypi: { key: 'package', label: 'Package', placeholder: 'archivehunter' },
  npm: { key: 'package', label: 'Package', placeholder: '@scope/name' },
};
