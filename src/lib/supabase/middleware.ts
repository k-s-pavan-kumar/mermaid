import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Middleware needs its own client because it can only mutate cookies on
// the outgoing NextResponse, not via next/headers' cookies() — unlike
// lib/supabase/server.ts, which is for Server Components/Route Handlers.
export async function getSupabaseUser(
  request: NextRequest
): Promise<{ response: NextResponse; user: { id: string } | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() (not getSession()) revalidates the token against Supabase's
  // servers instead of trusting a possibly-stale cookie — the right check
  // for anything that gates access.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}