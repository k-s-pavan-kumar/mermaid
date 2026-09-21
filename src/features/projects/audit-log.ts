import { table } from '@/lib/data';
import type { ProjectStatusLogEntry } from './types';
import { newId } from '@/lib/id';

/**
 * Write one append-only audit entry. Never call `.update()` or `.remove()`
 * on this table from anywhere — the whole point of the log (and what the
 * Reward Vault's gate leans on to stay trustworthy) is that a past entry
 * can't be quietly edited, including by the person who wrote it.
 */
export async function logProjectField(entry: {
  owner_id: string;
  project_id: string;
  project_name: string;
  field_changed: 'status' | 'earned';
  from_value: string;
  to_value: string;
  note?: string | null;
}): Promise<void> {
  await table<ProjectStatusLogEntry>('project_status_log').insert({
    id: newId(),
    owner_id: entry.owner_id,
    project_id: entry.project_id,
    project_name: entry.project_name,
    field_changed: entry.field_changed,
    from_value: entry.from_value,
    to_value: entry.to_value,
    changed_at: new Date().toISOString(),
    note: entry.note ?? null,
  });
}
