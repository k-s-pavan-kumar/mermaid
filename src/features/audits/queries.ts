import { table } from '@/lib/data';
import type { Audit } from './types';

/** Newest first. */
export async function getAudits(ownerId: string): Promise<Audit[]> {
  const rows = await table<Audit>('audits').where((a) => a.owner_id === ownerId);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
