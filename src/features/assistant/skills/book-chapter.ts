import type { Skill } from './types';

/**
 * Books die in the gap between "I have an idea" and "I know what today's
 * session produces". This skill's whole job is to close that gap with a
 * per-session plan, not a beautiful outline nobody writes from.
 */
export const bookChapter: Skill = {
  id: 'book-chapter',
  label: 'Book / chapter plan',
  blurb: 'A chapter map plus a session-by-session writing plan with word targets you can actually hit.',
  mascot: 'star',
  surfaces: ['project', 'book', 'notes'],
  needs: ['input'],
  inputLabel: 'The book — topic, reader, where you are now',
  inputPlaceholder: 'e.g. a practical book on secure SaaS architecture for solo founders; 2 chapters drafted; stuck on chapter 3',
  output: 'note',
  maxTokens: 3000,
  noteFolder: 'Writing',
  tags: ['book', 'writing'],
  noteTitle: (p) => `Book plan — ${p.input.slice(0, 50) || 'Untitled'}`,
  system: [
    'You plan books for someone who starts strongly and stalls in the middle.',
    'Everything must be written so a session can begin without deciding anything: each writing session has a named deliverable and a word target between 500 and 1200.',
    'Be specific about the argument of each chapter, not just its subject. A chapter without a claim is a chapter that stalls.',
  ].join(' '),
  prompt: (p) => `THE BOOK AS DESCRIBED:\n${p.input}`,
  sections: () => [
    { title: 'The promise', brief: 'Reader, the transformation promised, the one sentence the whole book defends, and the three competing books it must beat.' },
    { title: 'Chapter map', brief: 'Every chapter: title, the claim it argues, what the reader can do after it, and the rough word count. As a table.' },
    { title: 'Chapter-by-chapter beats', brief: 'For each chapter, the sequence of sections with the point each makes and the example or story that carries it.' },
    { title: 'Writing plan', brief: 'A session-by-session schedule: session number, chapter, exact deliverable, word target. Assume 3 sessions a week and be realistic about the total elapsed time.' },
    { title: 'Stall insurance', brief: 'The three most likely places this book stalls given the plan, the early warning sign for each, and the pre-agreed rule for what to do — including permission to cut a chapter.' },
  ],
};
