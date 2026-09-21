import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client: BYPASSES row level security. Server-only, and used for
 * exactly one thing — rendering the public client portal (/portal/<token>),
 * where there is no logged-in user for RLS to recognise. Never import this
 * from a client component and never expose the key with a NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — it is required for the public client portal. Add it in Vercel → Settings → Environment Variables.'
    );
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
