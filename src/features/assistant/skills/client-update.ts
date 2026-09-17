import type { Skill } from './types';
import { clientBrief, projectBrief, NO_INVENTION } from './context';

export const clientUpdate: Skill = {
  id: 'client-update',
  label: 'Draft a client update',
  blurb: 'A short status email from the actual task and meeting record — copy, edit, send.',
  mascot: 'idle',
  surfaces: ['client', 'project'],
  needs: ['client'],
  inputLabel: 'Anything to include or avoid',
  inputPlaceholder: 'e.g. mention the timeline slip, do not commit to a date yet',
  output: 'text',
  maxTokens: 900,
  system: [
    'You write client status updates: subject line, then under 180 words.',
    'Structure: what moved since last time, what is next, anything you need from them, and a clear ask or no-action-needed line.',
    'Professional and warm but never padded. No "I hope this email finds you well". Never promise a date the record does not support.',
    NO_INVENTION,
  ].join(' '),
  prompt: (p) => [clientBrief(p), p.project ? `\n${projectBrief(p)}` : '', p.input ? `\nOWNER'S STEER: ${p.input}` : ''].join('\n'),
};
