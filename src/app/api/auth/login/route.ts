// import { NextRequest, NextResponse } from 'next/server';
// import { verifyCredentials } from '@/lib/auth/local-auth';
// import { createSession } from '@/lib/auth/session';

// export async function POST(req: NextRequest) {
//   const form = await req.formData();
//   const email = String(form.get('email') ?? '');
//   const password = String(form.get('password') ?? '');

//   let valid: boolean;
//   try {
//     valid = verifyCredentials(email, password);
//   } catch (err) {
//     return NextResponse.json({ error: (err as Error).message }, { status: 500 });
//   }

//   if (!valid) {
//     return NextResponse.redirect(new URL('/login?error=1', req.url));
//   }

//   await createSession(email);
//   return NextResponse.redirect(new URL('/today', req.url));
// }


import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials } from '@/lib/auth/local-auth';
import { createSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const USE_SUPABASE_AUTH = process.env.DATA_PROVIDER === 'supabase';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  if (USE_SUPABASE_AUTH) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.redirect(new URL('/login?error=1', req.url));
    }
    // supabase.auth.signInWithPassword() already wrote the real Supabase
    // session cookie via createClient()'s cookie adapter — nothing else
    // to persist here.
    return NextResponse.redirect(new URL('/today', req.url));
  }

  let valid: boolean;
  try {
    valid = verifyCredentials(email, password);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (!valid) {
    return NextResponse.redirect(new URL('/login?error=1', req.url));
  }

  await createSession(email);
  return NextResponse.redirect(new URL('/today', req.url));
}