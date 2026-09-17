// import { cookies } from 'next/headers';
// import crypto from 'crypto';

// // Local/dev-only session handling. It's just enough to gate a single-user
// // tool behind a login screen while DATA_PROVIDER=local. Replace this with
// // Supabase Auth (supabase.auth.*, already reachable via src/lib/supabase/*)
// // once you're on DATA_PROVIDER=supabase and have real users — nothing in
// // src/features/* depends on how the session is created, only on
// // getSessionEmail() returning an owner id.

// const COOKIE_NAME = 'meridian_session';
// const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';

// function b64url(input: string): string {
//   return Buffer.from(input, 'utf8').toString('base64url');
// }

// function fromB64url(input: string): string {
//   return Buffer.from(input, 'base64url').toString('utf8');
// }

// function sign(value: string): string {
//   const encoded = b64url(value);
//   const mac = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
//   return `${encoded}.${mac}`;
// }

// function verify(signed: string): string | null {
//   const [encoded, mac] = signed.split('.');
//   if (!encoded || !mac) return null;
//   const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
//   // Constant-time compare so this isn't trivially timing-attackable.
//   const a = Buffer.from(mac);
//   const b = Buffer.from(expected);
//   if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
//   return fromB64url(encoded);
// }

// export async function createSession(email: string): Promise<void> {
//   const cookieStore = await cookies();
//   cookieStore.set(COOKIE_NAME, sign(email), {
//     httpOnly: true,
//     sameSite: 'lax',
//     secure: process.env.NODE_ENV === 'production',
//     path: '/',
//     maxAge: 60 * 60 * 24 * 7, // 7 days
//   });
// }

// export async function getSessionEmail(): Promise<string | null> {
//   const cookieStore = await cookies();
//   const token = cookieStore.get(COOKIE_NAME)?.value;
//   return token ? verify(token) : null;
// }

// export async function destroySession(): Promise<void> {
//   const cookieStore = await cookies();
//   cookieStore.delete(COOKIE_NAME);
// }

// export { COOKIE_NAME };


import { cookies } from 'next/headers';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';

// Local/dev-only session handling for DATA_PROVIDER=local. Once
// DATA_PROVIDER=supabase, every function below delegates to Supabase Auth
// instead — see the USE_SUPABASE_AUTH branches. Every call site in
// src/features/* and src/app/* just calls getSessionEmail() and treats the
// result as an opaque owner id, so nothing else needed to change: it's a
// UUID (the Supabase Auth user's id) under DATA_PROVIDER=supabase and an
// email string under DATA_PROVIDER=local — both are just "whatever value
// this row's owner_id equals."

const COOKIE_NAME = 'meridian_session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
const USE_SUPABASE_AUTH = process.env.DATA_PROVIDER === 'supabase';

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

/** Local-provider only. Under Supabase, the login route calls
 * supabase.auth.signInWithPassword() directly and Supabase's own cookie
 * adapter (see lib/supabase/server.ts) sets the session cookie — there is
 * nothing for this function to do in that mode. */
export async function createSession(email: string): Promise<void> {
  if (USE_SUPABASE_AUTH) return;
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
  if (USE_SUPABASE_AUTH) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // The Supabase Auth user's UUID — this is what owner_id columns and
    // RLS's auth.uid() actually store/compare, unlike a plain email string.
    return user?.id ?? null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? verify(token) : null;
}

export async function destroySession(): Promise<void> {
  if (USE_SUPABASE_AUTH) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return;
  }
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };