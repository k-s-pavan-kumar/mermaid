import { NextResponse } from 'next/server';
import { getSessionEmail } from '@/lib/auth/session';
import { getTasksForDate, getDueSoonTasks } from '@/features/today/queries';
import { startMinutes, durationMinutes } from '@/features/today/time';
import { todayIso } from '@/lib/tz/today';

export const dynamic = 'force-dynamic';

/** Today's open timed blocks and deadlines — what the browser reminder needs, nothing more. */
export async function GET() {
  const owner = await getSessionEmail();
  if (!owner) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const today = todayIso();
  const [tasks, due] = await Promise.all([getTasksForDate(owner, today), getDueSoonTasks(owner, today)]);
  return NextResponse.json(
    {
      today,
      blocks: tasks
        .filter((t) => !t.done && t.scheduled_hour !== null && t.scheduled_hour !== undefined)
        .map((t) => ({ id: t.id, title: t.title, start: startMinutes(t), end: startMinutes(t) + durationMinutes(t) })),
      dueToday: due.filter((t) => (t.due_date ?? '') <= today).map((t) => ({ id: t.id, title: t.title })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
