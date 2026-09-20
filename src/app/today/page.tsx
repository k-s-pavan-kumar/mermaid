import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getBrainDumpGrouped, getTasksForDate, getOverdueTasks, getDayLoads } from '@/features/today/queries';
import {
  addTask, scheduleTask, resizeTask, unscheduleTask, toggleTaskDone, deleteTask,
  moveTaskToToday, moveAllOverdueToToday, setOneThing, setTaskCategory, logFocusSession,
} from '@/features/today/actions';
import { getSettings } from '@/features/settings/queries';
import { getDayStats, getStreak, getStalledProjects } from '@/features/today/momentum';
import { getProjects } from '@/features/projects/queries';
import { TodayClient } from '@/features/today/components/TodayClient';
import { SkillPanel } from '@/features/assistant/components/SkillPanel';
import { skillCards } from '@/features/assistant/skills';
import { runSkillAction } from '@/features/assistant/actions';
import { Shell } from '@/components/Shell';
import { todayIso } from '@/lib/tz/today';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const { date } = await searchParams;
  // Home-timezone date, not the server's UTC date — see lib/tz/today.ts.
  const realToday = todayIso();
  const activeDate = date ?? realToday;

  const [brainDumpGroups, tasks, projects, overdue, dayLoads, streak, stalled, stats, settings] = await Promise.all([
    getBrainDumpGrouped(email),
    getTasksForDate(email, activeDate),
    getProjects(),
    getOverdueTasks(email, realToday),
    getDayLoads(email),
    getStreak(email),
    getStalledProjects(email),
    getDayStats(email, realToday, realToday),
    getSettings(email),
  ]);

  return (
    <Shell active="today" title="Today" crumb="Workspace" view="today">
      <TodayClient
        date={activeDate}
        realToday={realToday}
        brainDumpGroups={brainDumpGroups}
        tasks={tasks}
        overdue={overdue}
        dayLoads={dayLoads}
        streak={streak}
        stalled={stalled.map((p) => ({ id: p.id, name: p.name, days: p.days }))}
        focusMinutesToday={stats[realToday]?.focusMinutes ?? 0}
        projects={projects.map((p) => ({ id: p.id, name: p.name, type: p.type }))}
        categories={settings.categories}
        addTask={addTask}
        scheduleTask={scheduleTask}
        resizeTask={resizeTask}
        unscheduleTask={unscheduleTask}
        toggleTaskDone={toggleTaskDone}
        deleteTask={deleteTask}
        moveTaskToToday={moveTaskToToday}
        moveAllOverdueToToday={moveAllOverdueToToday}
        setOneThing={setOneThing}
        setTaskCategory={setTaskCategory}
        logFocusSession={logFocusSession}
      />

      <SkillPanel
        title="Stuck? Ask Meri"
        intro="These read your real task record. The breakdown skill writes its steps straight into the brain dump."
        skills={skillCards('today')}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        run={runSkillAction}
      />
    </Shell>
  );
}
