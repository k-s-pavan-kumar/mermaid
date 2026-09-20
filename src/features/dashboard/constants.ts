import { TYPE_COLOR, TYPE_LABEL } from '@/lib/project-colors';
import type { ProjectType } from '@/features/projects/types';

/**
 * Category keys and colours, split out from queries.ts so the client
 * components can import them.
 *
 * queries.ts pulls in the data layer (fs / Supabase server client), so a
 * 'use client' component importing a *value* from it would drag server-only
 * code into the browser bundle. Types are erased at compile time and are
 * safe to import from anywhere; these constants are not, hence this file.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** Buckets that aren't a project type. */
export const MEETINGS_KEY = 'meetings';
export const UNASSIGNED_KEY = 'unassigned';
export const UNTRACKED_KEY = 'untracked';

export interface CategoryMeta { key: string; label: string; color: string }

export const EXTRA_CATEGORIES: CategoryMeta[] = [
  { key: MEETINGS_KEY, label: 'Meetings & calls', color: 'var(--plumrose)' },
  { key: UNASSIGNED_KEY, label: 'Work, no project', color: 'var(--slate)' },
  { key: UNTRACKED_KEY, label: 'Unaccounted (sleep, life, admin)', color: 'var(--border)' },
];

/**
 * Resolve a bucket key to a label and colour.
 *
 * Lookup order: a user-defined category from Settings (exact match on its
 * key) first, since that's an explicit choice the person made; then the
 * built-in "meetings / no-project / unaccounted" buckets; then a project
 * type; then, for a category tag whose definition was since deleted in
 * Settings, the raw key itself rather than a crash — the task keeps its tag,
 * it just reads a little less prettily until it's retagged or the category
 * is redefined.
 */
export function categoryMeta(key: string, customCategories: CategoryMeta[] = []): CategoryMeta {
  const custom = customCategories.find((c) => c.key === key);
  if (custom) return custom;
  const extra = EXTRA_CATEGORIES.find((c) => c.key === key);
  if (extra) return extra;
  const t = key as ProjectType;
  if (TYPE_LABEL[t]) return { key, label: TYPE_LABEL[t], color: TYPE_COLOR[t] ?? 'var(--muted)' };
  return { key, label: key.replace(/[-_]/g, ' '), color: 'var(--muted)' };
}
