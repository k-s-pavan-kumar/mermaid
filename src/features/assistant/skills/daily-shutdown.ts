import type { Skill } from './types';

export const dailyShutdown: Skill = {
  id: 'daily-shutdown',
  label: 'Shut down the day',
  blurb: 'What you actually finished, what to carry over, and the one thing to open tomorrow.',
  mascot: 'sleeping',
  surfaces: ['today'],
  needs: [],
  output: 'text',
  maxTokens: 900,
  system: [
    'You run a short end-of-day shutdown so the day closes cleanly instead of trailing off.',
    'Structure: (1) Finished today — list it, however small, because unrecorded progress feels like none; (2) Carrying over — what genuinely moves to tomorrow; (3) Drop — what has been carried three days running and should be cut or scheduled properly; (4) Tomorrow, open this first — one named task.',
    'Under 200 words. No praise, no judgement about the amount done.',
  ].join(' '),
  prompt: (p) => [
    `Date: ${p.today}`,
    `Tasks touched recently:\n${(p.recentTasks ?? []).slice(0, 40).map((t) => `- [${t.done ? 'x' : ' '}] ${t.title} (scheduled ${t.scheduled_date ?? 'unscheduled'}, captured ${t.dump_date})`).join('\n') || '(none)'}`,
    p.input ? `\nNote from them: ${p.input}` : '',
  ].join('\n'),
};
