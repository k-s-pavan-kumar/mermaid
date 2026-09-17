/** Shared context snippets so every skill describes the workspace the same way. */

import type { SkillPayload } from './types';

export function projectBrief(p: SkillPayload): string {
  if (!p.project) return 'No project selected.';
  const pr = p.project;
  const types = (pr.types ?? [pr.type]).join(', ');
  const phases = pr.phases?.length ? pr.phases.map((ph) => ph.label).join(' → ') : 'none recorded';
  const milestones = pr.milestones?.length
    ? pr.milestones.map((m) => `${m.label}${m.occurred_on ? ` (${m.occurred_on})` : ''}`).join('; ')
    : 'none recorded';
  const metrics = pr.metrics?.length ? pr.metrics.map((m) => `${m.label}: ${m.value}`).join('; ') : 'none';
  const tasks = p.projectTasks?.length
    ? p.projectTasks.slice(0, 40).map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}`).join('\n')
    : '(no tasks recorded)';
  const notes = p.projectNotes?.length ? p.projectNotes.map((n) => n.title).join('; ') : 'none';

  return [
    `PROJECT: ${pr.name}`,
    `Types: ${types}`,
    `Status: ${pr.status}`,
    `Description: ${pr.description ?? '(none given)'}`,
    `Phases: ${phases}`,
    `Milestones: ${milestones}`,
    `Metrics: ${metrics}`,
    `Existing notes: ${notes}`,
    `Task list:\n${tasks}`,
  ].join('\n');
}

export function clientBrief(p: SkillPayload): string {
  if (!p.client) return 'No client selected.';
  const c = p.client;
  const meetings = p.clientMeetings?.length
    ? p.clientMeetings
        .slice(0, 8)
        .map((m) => `- ${m.starts_at.slice(0, 16).replace('T', ' ')} — ${m.title}${m.notes ? `: ${m.notes.slice(0, 300)}` : ''}`)
        .join('\n')
    : '(no meetings recorded)';

  return [
    `CLIENT: ${c.name}${c.company ? ` (${c.company})` : ''}`,
    `Work types: ${(c.work_types ?? []).join(', ') || 'unspecified'}`,
    `Timezone: ${c.timezone}`,
    `Notes: ${c.notes ?? '(none)'}`,
    `Recent meetings:\n${meetings}`,
  ].join('\n');
}

/** Honesty instruction reused by every skill that writes a document. */
export const NO_INVENTION = [
  'Ground everything in the supplied context.',
  'Where the context does not say, write the section as a decision that still needs making and mark it "TO CONFIRM:" rather than inventing a fact.',
  'Never fabricate metrics, dates, names, versions, endpoints or credentials.',
].join(' ');
