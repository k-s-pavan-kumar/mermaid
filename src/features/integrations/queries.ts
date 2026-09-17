import { table } from '@/lib/data';
import type { Integration } from './types';

export async function getIntegrationsForProject(projectId: string): Promise<Integration[]> {
  return table<Integration>('integrations').where((i) => i.project_id === projectId);
}
