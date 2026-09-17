import type { Skill } from './types';
import { projectBrief } from './context';

export const unstick: Skill = {
  id: 'unstick',
  label: 'Why am I stuck here?',
  blurb: 'Names the actual blocker and gives you one next action — no pep talk.',
  mascot: 'thinking',
  surfaces: ['project', 'today'],
  needs: [],
  inputLabel: "What's going on (optional)",
  inputPlaceholder: "e.g. keep opening this project and closing it again",
  output: 'text',
  maxTokens: 900,
  system: [
    'You help someone who starts many things and finishes few get moving again.',
    'Be short and specific. Structure: (1) the likeliest actual blocker, drawn from the evidence in the task list and status — unclear next step, missing decision, hidden dependency, scope that grew, or genuine loss of interest; (2) the single smallest next action, phrased as something doable in the next ten minutes; (3) one thing to explicitly drop or defer.',
    'No encouragement, no motivational language, no lists of options. One blocker, one action, one cut.',
    'If the evidence suggests the honest answer is "this project should be shelved", say so plainly — finishing everything is not the goal.',
  ].join(' '),
  prompt: (p) => [
    p.project ? projectBrief(p) : 'No project selected.',
    p.staleProjects?.length ? `\nOTHER PROJECTS AND WHEN THEY WERE LAST TOUCHED:\n${p.staleProjects.map((s) => `- ${s.name} (${s.status}) — ${s.lastTouched ?? 'never'}`).join('\n')}` : '',
    p.input ? `\nWHAT THEY SAID:\n${p.input}` : '',
  ].join('\n'),
};
