import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'meridian_session';
// /portal/<token> is deliberately public — the token is the credential, and
// the page it serves is read-only (see src/app/portal/[token]/page.tsx).
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/portal/'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.cookies.has(COOKIE_NAME)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
