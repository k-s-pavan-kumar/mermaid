import { NextResponse } from 'next/server';
import { getSessionEmail } from '@/lib/auth/session';
import { getLastActivityAt } from '@/features/journal/queries';

export const dynamic = 'force-dynamic';

/** When the signed-in user last wrote or edited a journal entry. The browser
 *  reminder asks this before firing so it can skip a nudge you don't need. */
export async function GET() {
  const owner = await getSessionEmail();
  if (!owner) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const last = await getLastActivityAt(owner);
  return NextResponse.json({ last }, { headers: { 'Cache-Control': 'no-store' } });
}
