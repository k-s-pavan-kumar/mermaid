import { table } from '@/lib/data';
import { grandTotal, type Invoice } from '@/features/billing/types';
import type { Project } from '@/features/projects/types';
import type { Task } from '@/features/today/types';
import type { Milestone } from '@/features/projects/types';
import type { Course } from '@/features/learning-tracker/types';
import { courseStatus, courseProgressPct } from '@/features/learning-tracker/types';

/**
 * What the Reward Vault's state machine needs to know about whatever a Need
 * is linked to, expressed the same way regardless of whether that's a
 * Project or a Course. Adding a third source type later (per the Learning
 * Tracker skill's own note — "won't be the last one") means writing one more
 * function that returns this shape, not touching the state machine itself.
 */
export interface SourceSnapshot {
  id: string;
  name: string;
  exists: boolean;
  /** Can a *new* link be created to this source right now? Rule 8: only an
   *  active (not already completed/dropped) source. */
  isActive: boolean;
  isDropped: boolean;
  /** The unlock condition itself — project: done + paid; course: completed. */
  satisfiesUnlock: boolean;
  progressPct: number;
  progressLabel: string;
  /** For the spend cap at link time (rule 3). Null for a course, which uses
   *  the flat DEFAULT_COURSE_CAP / configured course_cap instead. */
  capBasis: number | null;
  /** Small status chips for the "Linked source" table cell. */
  chips: { label: string; tone: 'green' | 'amber' | 'rust' | 'slate' }[];
}

async function projectSnapshot(projectId: string): Promise<SourceSnapshot | null> {
  const project = await table<Project>('projects').find(projectId);
  if (!project) return null;

  const [invoices, tasks, milestones] = await Promise.all([
    table<Invoice>('invoices').where((i) => i.project_id === projectId),
    table<Task>('tasks').where((t) => t.project_id === projectId),
    table<Milestone>('milestones').where((m) => m.project_id === projectId),
  ]);

  const paidInvoice = invoices.find((i) => i.status === 'paid');
  const isPaid = !!paidInvoice || !!project.earned_override;
  const isDone = project.status === 'done';
  const isDropped = project.status === 'dropped';

  // No native progress % on a Project, so approximate from whatever
  // breakdown exists: milestones first (most intentional signal), then
  // linked-task completion, then a status-based floor so an active project
  // with neither still shows *something* rather than a bare 0%.
  let progressPct: number;
  let progressLabel: string;
  if (milestones.length > 0) {
    const done = milestones.filter((m) => m.occurred_on).length;
    progressPct = Math.round((done / milestones.length) * 100);
    progressLabel = `${done} of ${milestones.length} milestones`;
  } else if (tasks.length > 0) {
    const done = tasks.filter((t) => t.done).length;
    progressPct = Math.round((done / tasks.length) * 100);
    progressLabel = `${done} of ${tasks.length} tasks done`;
  } else {
    progressPct = isDone ? 100 : project.status === 'review' ? 75 : project.status === 'risk' ? 40 : project.status === 'ontrack' ? 50 : 10;
    progressLabel = isDone ? 'Completed' : 'In progress';
  }
  if (isDone) progressPct = 100;

  const capBasis = paidInvoice ? grandTotal(paidInvoice) : project.earned_override?.amount ?? (invoices[0] ? grandTotal(invoices[0]) : 0);

  const chips: SourceSnapshot['chips'] = [];
  chips.push(
    isDone ? { label: 'Completed', tone: 'green' }
    : isDropped ? { label: 'Dropped', tone: 'rust' }
    : { label: 'Active', tone: 'amber' }
  );
  chips.push(
    isPaid ? { label: project.earned_override ? 'Marked earned' : 'Invoice paid', tone: 'green' }
    : { label: 'Not invoiced', tone: 'slate' }
  );

  return {
    id: project.id,
    name: project.name,
    exists: true,
    isActive: !isDone && !isDropped,
    isDropped,
    satisfiesUnlock: isDone && isPaid,
    progressPct,
    progressLabel,
    capBasis,
    chips,
  };
}

async function courseSnapshot(courseId: string): Promise<SourceSnapshot | null> {
  const course = await table<Course>('courses').find(courseId);
  if (!course) return null;

  const status = courseStatus(course);
  const progressPct = courseProgressPct(course);

  return {
    id: course.id,
    name: course.title,
    exists: true,
    isActive: status !== 'completed',
    isDropped: false, // a course has no drop equivalent — an abandoned one just stays in_progress forever
    satisfiesUnlock: status === 'completed',
    progressPct,
    progressLabel: `${course.completed_lessons} of ${course.total_lessons} lessons`,
    capBasis: null,
    chips: [
      status === 'completed'
        ? { label: 'Completed', tone: 'green' }
        : status === 'in_progress'
          ? { label: 'In progress', tone: 'amber' }
          : { label: 'Not started', tone: 'slate' },
    ],
  };
}

export async function getSourceSnapshot(sourceType: 'project' | 'course', sourceId: string): Promise<SourceSnapshot | null> {
  return sourceType === 'project' ? projectSnapshot(sourceId) : courseSnapshot(sourceId);
}

/** Active, unoccupied projects — what "Add a need" is allowed to offer. */
export async function getLinkableProjects(ownerId: string, occupiedProjectIds: Set<string>): Promise<{ id: string; name: string; invoiceAmount: number; occupiedBy: string | null }[]> {
  const projects = await table<Project>('projects').where((p) => p.owner_id === ownerId && p.status !== 'done' && p.status !== 'dropped');
  const invoices = await table<Invoice>('invoices').all();
  return projects.map((p) => {
    const projInvoices = invoices.filter((i) => i.project_id === p.id);
    const paid = projInvoices.find((i) => i.status === 'paid');
    return {
      id: p.id,
      name: p.name,
      invoiceAmount: paid ? grandTotal(paid) : projInvoices[0] ? grandTotal(projInvoices[0]) : 0,
      occupiedBy: occupiedProjectIds.has(p.id) ? p.id : null,
    };
  });
}

export async function getLinkableCourses(ownerId: string, occupiedCourseIds: Set<string>): Promise<{ id: string; name: string; occupiedBy: string | null }[]> {
  const courses = await table<Course>('courses').where((c) => c.owner_id === ownerId && courseStatus(c) !== 'completed');
  return courses.map((c) => ({ id: c.id, name: c.title, occupiedBy: occupiedCourseIds.has(c.id) ? c.id : null }));
}
