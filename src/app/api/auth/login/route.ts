import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials } from '@/lib/auth/local-auth';
import { createSession } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

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
