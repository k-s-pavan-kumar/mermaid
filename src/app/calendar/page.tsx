import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getBrainDump } from '@/features/today/queries';
import { scheduleTask, toggleTaskDone } from '@/features/today/actions';
import { getProjects } from '@/features/projects/queries';
import { table } from '@/lib/data';
import { Shell } from '@/components/Shell';
import { WeekGrid } from '@/features/calendar/components/WeekGrid';
import { MonthBoard } from '@/features/calendar/components/MonthBoard';
import { getDayStats } from '@/features/today/momentum';
import { todayIso, shiftIso } from '@/lib/tz/today';
import type { Task } from '@/features/today/types';
import type { Meeting } from '@/features/meetings/types';

/** Monday of the week containing `iso`. */
function weekStartOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const offset = (d.getDay() + 6) % 7;
  return shiftIso(iso, -offset);
}

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ week?: string; view?: string; month?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { week, view, month } = await searchParams;
  const realToday = todayIso();

  if (view === 'month') {
    const [y, m] = (month && /^\d{4}-\d{2}$/.test(month) ? month : realToday.slice(0, 7)).split('-').map(Number);
    const year = y ?? Number(realToday.slice(0, 4));
    const monthIndex = (m ?? 1) - 1;
    const first = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const last = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(new Date(year, monthIndex + 1, 0).getDate()).padStart(2, '0')}`;
    const stats = await getDayStats(email, first, last);

    return (
      <Shell active="calendar" title="Calendar" crumb="Workspace">
        <div className="chip-row">
          <a href="/calendar">Week</a>
          <a href="/calendar?view=month" className="active">Month</a>
        </div>
        <MonthBoard year={year} month={monthIndex} realToday={realToday} stats={stats} />
      </Shell>
    );
  }
  const weekStart = weekStartOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : realToday);
  const weekEnd = shiftIso(weekStart, 6);

  const [tasks, meetings, unscheduled, projects] = await Promise.all([
    table<Task>('tasks').where(
      (t) => t.owner_id === email && !!t.scheduled_date && t.scheduled_date! >= weekStart && t.scheduled_date! <= weekEnd
    ),
    table<Meeting>('meetings').where(
      (m) => m.owner_id === email && m.starts_at.slice(0, 10) >= weekStart && m.starts_at.slice(0, 10) <= weekEnd
    ),
    getBrainDump(email),
    getProjects(),
  ]);

  return (
    <Shell active="calendar" title="Calendar" crumb="Workspace">
      <div className="chip-row">
        <a href="/calendar" className="active">Week</a>
        <a href="/calendar?view=month">Month</a>
      </div>
      <WeekGrid
        weekStart={weekStart}
        realToday={realToday}
        tasks={tasks}
        meetings={meetings}
        unscheduled={unscheduled.slice(0, 30)}
        projects={projects.map((p) => ({ id: p.id, name: p.name, type: p.type }))}
        scheduleTask={scheduleTask}
        toggleTaskDone={toggleTaskDone}
      />
    </Shell>
  );
}
