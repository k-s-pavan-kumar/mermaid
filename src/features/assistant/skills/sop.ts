import type { Skill } from './types';
import { NO_INVENTION } from './context';

export const sop: Skill = {
  id: 'sop',
  label: 'Write an SOP',
  blurb: 'Turn something you just did into a repeatable checklist you can follow on a bad day.',
  mascot: 'checklist',
  surfaces: ['notes', 'project'],
  needs: ['input'],
  inputLabel: 'Describe the process — messy is fine',
  inputPlaceholder: 'e.g. how I onboard a new Figma student: send welcome mail, add to group, share board template…',
  output: 'note',
  maxTokens: 2600,
  noteFolder: 'SOPs',
  tags: ['sop'],
  noteTitle: (p) => `SOP — ${p.input.slice(0, 60) || 'Untitled process'}`,
  system: [
    'You turn a messy description into a standard operating procedure.',
    'Numbered steps, one action per step, written in the imperative. Each step names the tool used and the done-condition.',
    'Assume the reader is the author on a low-energy day: no step may require remembering something not written down.',
    NO_INVENTION,
  ].join(' '),
  prompt: (p) => `PROCESS AS DESCRIBED:\n${p.input}`,
  sections: () => [
    { title: 'When to use this', brief: 'The trigger, the expected outcome, and how long it usually takes.' },
    { title: 'Before you start', brief: 'Access, tools, files and information to have open first.' },
    { title: 'The procedure', brief: 'Numbered steps with a done-condition each. Include the exact text of any message or command that gets reused.' },
    { title: 'Checks and common failures', brief: 'How to verify it worked, what usually goes wrong, and the fix for each.' },
  ],
};
