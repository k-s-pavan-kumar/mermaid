import { table } from '@/lib/data';
import { DEFAULT_FIELDS, FIELD_ORDER, type Tag } from './types';
import { newId } from '@/lib/id';

const inFlight = new Map<string, Promise<void>>();

/**
 * First visit: give the owner the starter fields (SaaS, Gaming, …). Only runs
 * when they have no tags at all, and deduped per process so the sidebar and
 * the page rendering at the same moment don't both insert. A unique index on
 * (owner, lower(name)) backs this up in Supabase; losing that race is ignored.
 */
async function seedIfEmpty(ownerId: string): Promise<void> {
  const existing = await table<Tag>('tags').where((t) => t.owner_id === ownerId);
  if (existing.length > 0) return;
  for (const [i, f] of DEFAULT_FIELDS.entries()) {
    try {
      await table<Tag>('tags').insert({
        id: newId(), owner_id: ownerId, name: f.name, color: f.color, is_field: true, special: f.special,
        sort_order: i, created_at: new Date().toISOString(),
      });
    } catch { /* another request already inserted it */ }
  }
}

/**
 * Keep existing accounts in step with the starter set, once and quietly:
 * add the Bug Bounty field if it's missing, and call the old "Publishing"
 * field "Book Publishing". Deleting a special field isn't allowed, so this
 * never fights a choice the user made.
 */
async function applyFixups(ownerId: string): Promise<void> {
  const all = await table<Tag>('tags').where((t) => t.owner_id === ownerId);
  const named = (n: string) => all.find((t) => t.name.toLowerCase() === n);
  if (!all.some((t) => t.special === 'bounty')) {
    const existing = named('bug bounty');
    try {
      if (existing) await table<Tag>('tags').update(existing.id, { is_field: true, special: 'bounty' });
      else await table<Tag>('tags').insert({
        id: newId(), owner_id: ownerId, name: 'Bug Bounty', color: '#E23B6B', is_field: true, special: 'bounty',
        sort_order: 4, created_at: new Date().toISOString(),
      });
    } catch { /* migration 022 not applied yet — the check constraint refuses 'bounty' */ }
  }
  const pub = named('publishing');
  if (pub && pub.is_field && !pub.special && !named('book publishing')) {
    try { await table<Tag>('tags').update(pub.id, { name: 'Book Publishing' }); } catch { /* unique index race */ }
  }
}

/** All tags, fields first (in their set order), then plain tags A–Z. Seeds the starter fields once. */
export async function getTags(ownerId: string): Promise<Tag[]> {
  let pending = inFlight.get(ownerId);
  if (!pending) {
    pending = seedIfEmpty(ownerId).then(() => applyFixups(ownerId)).finally(() => inFlight.delete(ownerId));
    inFlight.set(ownerId, pending);
  }
  await pending;
  const rows = await table<Tag>('tags').where((t) => t.owner_id === ownerId);
  const rank = (t: Tag) => { const i = FIELD_ORDER.indexOf(t.name.toLowerCase()); return i >= 0 ? i : 100 + t.sort_order; };
  return rows.sort((a, b) =>
    Number(b.is_field) - Number(a.is_field) || rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function getFields(ownerId: string): Promise<Tag[]> {
  return (await getTags(ownerId)).filter((t) => t.is_field);
}

/** Like getFields, but never throws — for the sidebar, which must keep working before the tags migration is run. */
export async function getFieldsSafe(ownerId: string): Promise<Tag[]> {
  try { return await getFields(ownerId); } catch { return []; }
}

export async function getTagsSafe(ownerId: string): Promise<Tag[]> {
  try { return await getTags(ownerId); } catch { return []; }
}
