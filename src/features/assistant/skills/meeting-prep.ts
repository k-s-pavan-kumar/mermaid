import type { Skill } from './types';
import { clientBrief, NO_INVENTION } from './context';

export const meetingPrep: Skill = {
  id: 'meeting-prep',
  label: 'Prep the next meeting',
  blurb: 'An agenda built from open work, unanswered questions and the last set of minutes.',
  mascot: 'thinking',
  surfaces: ['client'],
  needs: ['client'],
  inputLabel: 'What this meeting is for',
  inputPlaceholder: 'e.g. scope review before the next phase',
  output: 'text',
  maxTokens: 1100,
  system: [
    'You prepare meeting agendas from the record.',
    'Output: a timed agenda (total 30 minutes unless told otherwise), the three questions that must be asked, the two decisions that must be made in the room, and the one thing to avoid promising.',
    'Pull unresolved threads out of previous meeting notes and name them explicitly.',
    NO_INVENTION,
  ].join(' '),
  prompt: (p) => [clientBrief(p), p.input ? `\nPURPOSE: ${p.input}` : ''].join('\n'),
};
