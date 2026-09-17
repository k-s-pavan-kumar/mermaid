import { table } from '@/lib/data';
import { DEFAULT_BUSINESS, DEFAULT_CLOCKS, DEFAULT_TARGETS, type WorkspaceSettings } from './types';

/**
 * Settings are read on every page (the clock strip is in the shell), so this
 * never throws and never returns undefined — a missing row just means
 * "defaults", which keeps a fresh install from erroring before you've been
 * anywhere near a settings screen.
 */
export async function getSettings(ownerId: string): Promise<WorkspaceSettings> {
  const rows = await table<WorkspaceSettings>('settings').where((s) => s.owner_id === ownerId);
  const found = rows[0];

  return {
    id: found?.id ?? `set_${ownerId}`,
    owner_id: ownerId,
    clocks: found?.clocks?.length ? found.clocks : DEFAULT_CLOCKS,
    business: { ...DEFAULT_BUSINESS, ...(found?.business ?? {}) },
    // Spread over defaults so a settings row written before targets existed
    // reads back as "no targets set" rather than undefined.
    targets: { ...DEFAULT_TARGETS, ...(found?.targets ?? {}) },
    code_root: found?.code_root ?? '',
  };
}
