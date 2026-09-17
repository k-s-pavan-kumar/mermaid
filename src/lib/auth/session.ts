import { cookies } from 'next/headers';
import crypto from 'crypto';

// Local/dev-only session handling. It's just enough to gate a single-user
// tool behind a login screen while DATA_PROVIDER=local. Replace this with
// Supabase Auth (supabase.auth.*, already reachable via src/lib/supabase/*)
// once you're on DATA_PROVIDER=supabase and have real users — nothing in
// src/features/* depends on how the session is created, only on
// getSessionEmail() returning an owner id.

const COOKIE_NAME = 'meridian_session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromB64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(value: string): string {
  const encoded = b64url(value);
  const mac = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${mac}`;
}

function verify(signed: string): string | null {
  const [encoded, mac] = signed.split('.');
  if (!encoded || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  // Constant-time compare so this isn't trivially timing-attackable.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return fromB64url(encoded);
}

export async function createSession(email: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? verify(token) : null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
