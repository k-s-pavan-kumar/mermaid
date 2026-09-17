/**
 * Skills are self-contained prompts-with-a-job.
 *
 * Each one lives in its own file in this folder and is exported from
 * index.ts — adding a skill is adding a file and one line, never touching a
 * page. Surfaces render their own buttons from the registry, so a new skill
 * shows up in the UI the moment it is registered.
 */

import type { Project, ProjectPhase, Milestone, ProjectMetric } from '@/features/projects/types';
import type { Client } from '@/features/clients/types';
import type { Task } from '@/features/today/types';
import type { Note } from '@/features/notes/types';
import type { Meeting } from '@/features/meetings/types';
import type { WorkspaceSettings } from '@/features/settings/types';

/** Where a skill's button appears. */
export type Surface = 'project' | 'notes' | 'client' | 'today' | 'book';

/** What the skill does with the model's output. */
export type SkillOutput =
  | 'note'   // long-form markdown → a note + a real .md file in the vault
  | 'tasks'  // JSON array of task titles → real tasks
  | 'text';  // shown back in the panel, nothing stored

export interface SkillPayload {
  ownerId: string;
  today: string;
  input: string;
  settings: WorkspaceSettings;
  project?: Project & { phases: ProjectPhase[]; milestones: Milestone[]; metrics: ProjectMetric[] };
  projectTasks?: Task[];
  projectNotes?: Note[];
  client?: Client;
  clientMeetings?: Meeting[];
  recentTasks?: Task[];
  staleProjects?: { name: string; status: string; lastTouched: string | null }[];
}

export interface SkillSection {
  title: string;
  /** What this section must cover — becomes the per-section instruction. */
  brief: string;
}

export interface Skill {
  id: string;
  label: string;
  /** One line under the button. Say what you get, not what it does. */
  blurb: string;
  mascot: string;
  surfaces: Surface[];
  /** Context the skill can't work without; the UI disables the button until present. */
  needs: ('project' | 'client' | 'input')[];
  inputLabel?: string;
  inputPlaceholder?: string;
  output: SkillOutput;
  system: string;
  prompt: (p: SkillPayload) => string;
  /**
   * Long documents are generated section by section instead of in one call:
   * a single request can't produce twenty pages before it hits a token
   * ceiling, and the quality collapses long before the limit does. Each
   * section gets the same context plus the outline, so the parts stay
   * consistent without the model having to hold the whole document at once.
   */
  sections?: (p: SkillPayload) => SkillSection[];
  noteTitle?: (p: SkillPayload) => string;
  noteFolder?: string;
  tags?: string[];
  /** Rough token budget per call; long-form sections need more room. */
  maxTokens?: number;
}
