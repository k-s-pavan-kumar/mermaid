import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inServiceScope } from './service-scope';
import type { TableOps } from './local-store';

// Same shape as local-store's table(), backed by Postgres via Supabase
// instead of a JSON file. `where()` has an honest limitation: since the
// predicate is an arbitrary JS function, it can't be pushed down into SQL
// generically, so this fetches the full table and filters in memory. Fine
// for a single-user tool at this scale; if a table grows large enough for
// that to matter, replace that one call site with a real .eq()/.filter()
// Supabase query instead of routing it through this generic layer.
// Per-request user client (RLS applies), unless running inside
// runWithServiceRole() — only the public portal does that.
async function createClient() {
  return inServiceScope() ? createAdminClient() : await createUserClient();
}

export function table<T extends { id: string }>(name: string): TableOps<T> {
  return {
    async all(): Promise<T[]> {
      const supabase = (await createClient()) as any; // untyped until real Database types are generated (see supabase:types script)
      const { data, error } = await supabase.from(name).select('*');
      if (error) throw new Error(`Supabase select on "${name}" failed: ${error.message}`);
      return (data ?? []) as T[];
    },

    async find(id: string): Promise<T | undefined> {
      const supabase = (await createClient()) as any; // untyped until real Database types are generated (see supabase:types script)
      const { data, error } = await supabase.from(name).select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Supabase select on "${name}" failed: ${error.message}`);
      return (data ?? undefined) as T | undefined;
    },

    async findBy(column: keyof T & string, value: unknown): Promise<T | undefined> {
      const supabase = (await createClient()) as any;
      const { data, error } = await supabase.from(name).select('*').eq(column, value).limit(1).maybeSingle();
      if (error) throw new Error(`Supabase select on "${name}" failed: ${error.message}`);
      return (data ?? undefined) as T | undefined;
    },

    async where(pred: (row: T) => boolean): Promise<T[]> {
      const all = await this.all();
      return all.filter(pred);
    },

    async insert(row: T): Promise<T> {
      const supabase = (await createClient()) as any; // untyped until real Database types are generated (see supabase:types script)
      const { data, error } = await supabase.from(name).insert(row).select().single();
      if (error) throw new Error(`Supabase insert on "${name}" failed: ${error.message}`);
      return data as T;
    },

    async update(id: string, patch: Partial<T>): Promise<T | undefined> {
      const supabase = (await createClient()) as any; // untyped until real Database types are generated (see supabase:types script)
      const { data, error } = await supabase.from(name).update(patch).eq('id', id).select().maybeSingle();
      if (error) throw new Error(`Supabase update on "${name}" failed: ${error.message}`);
      return (data ?? undefined) as T | undefined;
    },

    async remove(id: string): Promise<void> {
      const supabase = (await createClient()) as any; // untyped until real Database types are generated (see supabase:types script)
      const { error } = await supabase.from(name).delete().eq('id', id);
      if (error) throw new Error(`Supabase delete on "${name}" failed: ${error.message}`);
    },
  };
}
