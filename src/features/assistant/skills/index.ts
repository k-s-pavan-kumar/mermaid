import type { Skill, Surface } from './types';
import { projectHandover } from './project-handover';
import { apiDocs } from './api-docs';
import { sop } from './sop';
import { taskBreakdown } from './task-breakdown';
import { unstick } from './unstick';
import { dailyShutdown } from './daily-shutdown';
import { weeklyReview } from './weekly-review';
import { bookChapter } from './book-chapter';
import { clientUpdate } from './client-update';
import { meetingPrep } from './meeting-prep';

/**
 * The skill registry.
 *
 * Adding a skill: drop a file in this folder, export it, add it to this
 * array. Surfaces render their buttons from `skillsFor()`, so nothing else
 * needs touching — no page edit, no new route, no new action.
 */
export const SKILLS: Skill[] = [
  projectHandover,
  apiDocs,
  sop,
  taskBreakdown,
  unstick,
  bookChapter,
  weeklyReview,
  dailyShutdown,
  clientUpdate,
  meetingPrep,
];

export function skillsFor(surface: Surface): Skill[] {
  return SKILLS.filter((s) => s.surfaces.includes(surface));
}

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export type { Skill, SkillPayload, Surface } from './types';

/** Registry → plain objects safe to hand to a client component. */
export function skillCards(surface: Surface) {
  return skillsFor(surface).map((s) => ({
    id: s.id,
    label: s.label,
    blurb: s.blurb,
    mascot: s.mascot,
    needs: s.needs as string[],
    inputLabel: s.inputLabel,
    inputPlaceholder: s.inputPlaceholder,
    output: s.output,
    long: !!s.sections,
  }));
}
