import type { Skill } from './types';

export const weeklyReview: Skill = {
  id: 'weekly-review',
  label: 'Weekly review',
  blurb: 'Where the week actually went, which projects are drifting, and what next week should hold.',
  mascot: 'search',
  surfaces: ['today', 'notes'],
  needs: [],
  output: 'note',
  maxTokens: 2200,
  noteFolder: 'Reviews',
  tags: ['review'],
  noteTitle: (p) => `Weekly review — week of ${p.today}`,
  system: [
    'You write an honest weekly review for someone juggling client work, side projects, teaching and a book.',
    'Be concrete and unsentimental. Name the projects that moved and the ones that did not, and say what the pattern suggests.',
    'Finish with a short, realistic plan: three commitments maximum for next week, and explicitly what is being left alone.',
  ].join(' '),
  prompt: (p) => [
    `Week ending: ${p.today}`,
    `Tasks:\n${(p.recentTasks ?? []).slice(0, 80).map((t) => `- [${t.done ? 'x' : ' '}] ${t.title} (${t.scheduled_date ?? 'unscheduled'})`).join('\n') || '(none)'}`,
    p.staleProjects?.length ? `\nProjects and last activity:\n${p.staleProjects.map((s) => `- ${s.name} (${s.status}) — ${s.lastTouched ?? 'never'}`).join('\n')}` : '',
    p.input ? `\nTheir own note on the week: ${p.input}` : '',
  ].join('\n'),
  sections: () => [
    { title: 'What moved', brief: 'Completed work grouped by project, with the size of the movement.' },
    { title: 'What stalled and why', brief: 'Projects with no completed work this week, and the most likely cause from the evidence.' },
    { title: 'Patterns', brief: 'What the week says about how the time was actually spent versus intended. Name one habit to keep and one to change.' },
    { title: 'Next week', brief: 'At most three commitments, each with its first concrete step. Then a short "not touching this week" list.' },
  ],
};
