import { table } from '@/lib/data';
import { newId } from '@/lib/id';
import { TAG_COLORS, normaliseTagName, type Tag } from './types';

/**
 * Make sure each name exists as a tag for this owner (case-insensitive),
 * creating plain (non-field) tags for the ones that don't. Returns the
 * canonical names. Never throws: if the tags table isn't there yet the caller
 * just carries on without it.
 */
export async function ensureTagNames(ownerId: string, names: string[]): Promise<void> {
  try {
    const have = await table<Tag>('tags').where((t) => t.owner_id === ownerId);
    const known = new Set(have.map((t) => t.name.toLowerCase()));
    let i = have.length;
    for (const raw of names) {
      const name = normaliseTagName(raw);
      if (!name || known.has(name.toLowerCase())) continue;
      known.add(name.toLowerCase());
      await table<Tag>('tags').insert({
        id: newId(), owner_id: ownerId, name, color: TAG_COLORS[i++ % TAG_COLORS.length]!,
        is_field: false, special: null, sort_order: 0, created_at: new Date().toISOString(),
      });
    }
  } catch { /* tags table missing — migration 020 not applied yet */ }
}
