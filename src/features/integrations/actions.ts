'use server';

import { revalidatePath } from 'next/cache';
import { table } from '@/lib/data';
import { getSessionEmail } from '@/lib/auth/session';
import { PROVIDERS } from './registry';
import type { Integration } from './types';
import type { ProjectMetric } from '@/features/projects/types';
import { newId } from '@/lib/id';

async function requireOwner(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error('Not authenticated');
  return email;
}

export async function connectIntegration(projectId: string, formData: FormData): Promise<void> {
  const owner_id = await requireOwner();
  const provider = String(formData.get('provider') ?? '') as Integration['provider'];
  const configValue = String(formData.get('config_value') ?? '').trim();
  const configKey = String(formData.get('config_key') ?? '').trim();
  if (!provider || !configValue || !configKey) return;

  await table<Integration>('integrations').insert({
    id: newId('int'),
    owner_id,
    project_id: projectId,
    provider,
    config: { [configKey]: configValue },
    last_synced_at: null,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function refreshIntegration(projectId: string, integrationId: string): Promise<{ error?: string }> {
  await requireOwner();
  const integration = await table<Integration>('integrations').find(integrationId);
  if (!integration) return { error: 'Integration not found.' };

  const fetchFn = PROVIDERS[integration.provider];
  try {
    const results = await fetchFn(integration.config);
    for (const r of results) {
      await table<ProjectMetric>('project_metrics').insert({
        id: newId('metric'),
        project_id: projectId,
        source: integration.provider,
        label: r.label,
        value: r.value,
        delta: r.delta,
        captured_at: new Date().toISOString(),
      });
    }
    await table<Integration>('integrations').update(integrationId, { last_synced_at: new Date().toISOString() });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function disconnectIntegration(projectId: string, integrationId: string): Promise<void> {
  await requireOwner();
  await table<Integration>('integrations').remove(integrationId);
  revalidatePath(`/projects/${projectId}`);
}
