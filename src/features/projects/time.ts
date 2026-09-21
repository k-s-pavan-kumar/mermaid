import type { FocusSession, Task } from '@/features/today/types';

export interface ProjectTimeSummary {
  /** Minutes logged against tasks, plus timer sessions on the project that weren't tied to a task. */
  totalMinutes: number;
  hours: number;
  /** Money ÷ hours. null when no time has been logged — never divide by zero. */
  rateInvoiced: number | null;
  rateCollected: number | null;
  /** Agreed total cost ÷ hours, when a fixed cost is known. */
  rateOnAgreedCost: number | null;
}

/**
 * Hours worked on a project and the working rate they imply.
 *
 * Sources of time, counted once each:
 *  - task.logged_minutes — what you typed on the task, plus every timer
 *    session finished on that task (logFocusSession adds them in);
 *  - focus sessions on the project with NO task — they belong to no task's
 *    total, so they're added here. Sessions that do have a task are already
 *    inside that task's logged_minutes and are deliberately skipped, or every
 *    timed block would count twice.
 */
export function projectTime(input: {
  tasks: Pick<Task, 'logged_minutes'>[];
  sessions: Pick<FocusSession, 'task_id' | 'completed_minutes'>[];
  invoiced: number;
  collected: number;
  agreedCost?: number | null;
}): ProjectTimeSummary {
  const taskMinutes = input.tasks.reduce((s, t) => s + Math.max(0, t.logged_minutes ?? 0), 0);
  const looseMinutes = input.sessions
    .filter((s) => !s.task_id)
    .reduce((s, x) => s + Math.max(0, x.completed_minutes ?? 0), 0);
  const totalMinutes = taskMinutes + looseMinutes;
  const hours = totalMinutes / 60;
  const per = (money: number) => (hours > 0 && money > 0 ? Math.round(money / hours) : null);

  return {
    totalMinutes,
    hours: Math.round(hours * 100) / 100,
    rateInvoiced: per(input.invoiced),
    rateCollected: per(input.collected),
    rateOnAgreedCost: per(input.agreedCost ?? 0),
  };
}

export const fmtHours = (h: number): string => `${h.toLocaleString('en-IN', { maximumFractionDigits: 2 })} h`;
