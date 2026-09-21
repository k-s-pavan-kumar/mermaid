/**
 * Single source of truth for new row ids.
 *
 * Every primary key in supabase/schema.sql is either `uuid` or `text`. A real
 * UUID is valid for both, whereas the old `client_<timestamp>_<random>` style
 * strings were rejected by every `uuid` column ("invalid input syntax for type
 * uuid"). Always generate ids through this function.
 *
 * `prefix` is accepted (and ignored) so call sites that used to pass one keep
 * compiling.
 */
export function newId(_prefix?: string): string {
  return globalThis.crypto.randomUUID();
}
