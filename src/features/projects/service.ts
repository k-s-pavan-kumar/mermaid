import { table } from '@/lib/data';
import { newId } from '@/lib/id';
import { TYPE_COLOR } from '@/lib/project-colors';
import type { Project, ProjectType } from './types';

/**
 * Create a project, tolerating a database that is older than the app.
 *
 * A project type the database's check constraint doesn't know yet ('teaching'
 * and 'marketing' arrived with migration 009) used to crash the whole save. If
 * the wanted type is refused we retry as 'internal' — every schema version has
 * it — and report that a fallback happened. Any other failure propagates.
 *
 * Lives here, not in an actions file: files marked 'use server' expose every
 * export as a callable endpoint, and this must only be reachable from our own
 * actions, which have already checked who the owner is.
 */
export async function createProjectRecord(
  owner: string,
  input: {
    name: string; type: string; description?: string | null;
    /** Extra types after the primary one, e.g. ['client', 'web'] — the first entry of the final list is the primary. */
    extraTypes?: string[];
    clientId?: string | null;
    fieldId?: string | null; productId?: string | null; productRole?: string | null;
  },
): Promise<{ project: Project; usedFallback: boolean }> {
  const known = (t: string) => t in TYPE_COLOR;
  const wanted = [...new Set([input.type, ...(input.extraTypes ?? [])].filter(known))] as ProjectType[];
  if (wanted.length === 0) wanted.push('internal');
  const insert = (types: ProjectType[]) => table<Project>('projects').insert({
    id: newId('proj'), owner_id: owner, name: input.name, type: types[0]!, types, client_id: input.clientId ?? null,
    status: 'idea', description: input.description ?? null, created_at: new Date().toISOString(),
    ...(input.fieldId ? { field_id: input.fieldId } : {}),
    ...(input.productId ? { product_id: input.productId, product_role: input.productRole ?? null } : {}),
  });
  // Try everything asked for, then just the primary type, then 'internal'.
  const candidates: ProjectType[][] = [wanted, [wanted[0]!], ['internal']];
  const attempts = candidates.filter((a, i) => candidates.findIndex((b) => b.join() === a.join()) === i);
  let lastErr: unknown;
  for (const [i, types] of attempts.entries()) {
    try {
      return { project: await insert(types), usedFallback: i > 0 };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/projects_types?_check/.test(msg)) throw err;
    }
  }
  throw lastErr;
}
