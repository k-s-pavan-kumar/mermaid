import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

// Used inside 'use client' components. Safe to call repeatedly —
// createBrowserClient reuses a single instance under the hood.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
