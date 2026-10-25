/** Pure helpers for renaming / merging tags (clients store tags by name). */
import { normaliseTagName } from './types';

/** Replace `from` with `to` in a list of tag names (case-insensitive), keeping order and dropping duplicates. */
export function replaceTagInList(list: string[], from: string, to: string): string[] {
  const f = from.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const name = t.toLowerCase() === f ? to : t;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Why a rename isn't allowed, or null if it is. `others` = names of every other tag. */
export function renameProblem(newName: string, others: string[]): string | null {
  const n = normaliseTagName(newName);
  if (!n) return 'Type a name.';
  if (others.some((o) => o.toLowerCase() === n.toLowerCase())) return `A tag called "${n}" already exists — use Merge instead.`;
  return null;
}
