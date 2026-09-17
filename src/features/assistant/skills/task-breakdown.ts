import type { Skill } from './types';
import { projectBrief } from './context';

/**
 * The anti-paralysis skill. A task that reads "build the billing page" is
 * unstartable; fifteen-minute steps with an explicit first physical action
 * are startable, and starting is the whole battle.
 */
export const taskBreakdown: Skill = {
  id: 'task-breakdown',
  label: 'Break it into 15-minute steps',
  blurb: 'Turns one intimidating task into small startable steps — added straight to your brain dump.',
  mascot: 'idea',
  surfaces: ['project', 'today'],
  needs: ['input'],
  inputLabel: 'The task that feels too big',
  inputPlaceholder: 'e.g. finish the payments module / write chapter 3',
  output: 'tasks',
  maxTokens: 1200,
  system: [
    'You break work into steps a tired person can start without deciding anything.',
    'Rules: every step is doable in 10–20 minutes; every step starts with a concrete verb; the FIRST step must be almost trivially small (open the file, write the heading, list the fields) because starting is the hard part; no step may say "plan", "think about", "research" without naming exactly what to produce.',
    'Return ONLY a JSON array of 5 to 12 strings. No prose, no markdown, no code fences.',
  ].join(' '),
  prompt: (p) => [
    p.project ? projectBrief(p) : '',
    `\nTASK TO BREAK DOWN:\n${p.input}`,
    '\nReturn the JSON array only.',
  ].join('\n'),
};
