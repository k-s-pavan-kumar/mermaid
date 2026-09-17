// import { NextRequest, NextResponse } from 'next/server';

// const COOKIE_NAME = 'meridian_session';
// // /portal/<token> is deliberately public — the token is the credential, and
// // the page it serves is read-only (see src/app/portal/[token]/page.tsx).
// const PUBLIC_PATHS = ['/login', '/api/auth/login', '/portal/'];

// export function middleware(req: NextRequest) {
//   const { pathname } = req.nextUrl;
//   if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
//     return NextResponse.next();
//   }

//   if (!req.cookies.has(COOKIE_NAME)) {
//     return NextResponse.redirect(new URL('/login', req.url));
//   }

//   return NextResponse.next();
// }

// export const config = {
//   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
// };


import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/middleware';

const COOKIE_NAME = 'meridian_session';
// /portal/<token> is deliberately public — the token is the credential, and
// the page it serves is read-only (see src/app/portal/[token]/page.tsx).
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/portal/'];
const USE_SUPABASE_AUTH = process.env.DATA_PROVIDER === 'supabase';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (USE_SUPABASE_AUTH) {
    const { response, user } = await getSupabaseUser(req);
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return response;
  }

  if (!req.cookies.has(COOKIE_NAME)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next internals AND any request for a static file (anything with
  // a file extension — images, fonts, etc. under /public) from auth
  // middleware. Without the trailing `.*\..*` exclusion, requests like
  // /mascot/meri.png get treated as protected routes and redirected to
  // /login when there's no session cookie yet — which is exactly why
  // images were breaking on the login page itself.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};