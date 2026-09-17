import { table as localTable, type TableOps } from './local-store';
import { table as supabaseTable } from './supabase-store';

// DATA_PROVIDER=local    → data/db.local.json (zero setup, for dev/testing)
// DATA_PROVIDER=supabase → real Postgres via Supabase (see supabase/schema.sql)
// Both implementations satisfy the same async TableOps<T> interface, so
// this really is a one-line env change — nothing in src/features/* needs
// to know or care which one is active.
const provider = process.env.DATA_PROVIDER ?? 'local';

export function table<T extends { id: string }>(name: string): TableOps<T> {
  if (provider === 'supabase') {
    return supabaseTable<T>(name);
  }
  return localTable<T>(name as any);
}
