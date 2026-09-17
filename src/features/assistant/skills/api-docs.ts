import type { Skill } from './types';
import { projectBrief, NO_INVENTION } from './context';

export const apiDocs: Skill = {
  id: 'api-docs',
  label: 'API endpoint reference',
  blurb: 'Every route and server action documented: shapes, auth, errors, example calls.',
  mascot: 'working',
  surfaces: ['project', 'notes'],
  needs: ['project'],
  inputLabel: 'Paste route files, a route list, or describe the API',
  inputPlaceholder: 'e.g. POST /api/assistant, GET /api/projects/:id … or paste the route handlers',
  output: 'note',
  maxTokens: 3500,
  noteFolder: 'Projects',
  tags: ['api', 'documentation'],
  noteTitle: (p) => `${p.project?.name ?? 'Project'} — API reference`,
  system: [
    'You write API reference documentation of the quality developers actually bookmark.',
    'One section per endpoint. Always include: purpose, method and path, auth, path/query/body parameters in a table, success response with a realistic JSON example, every error status and what triggers it, and a runnable curl example.',
    'Flag anything that looks like it lacks authorisation or input validation under a "Risks" line.',
    NO_INVENTION,
  ].join(' '),
  prompt: (p) => [
    projectBrief(p),
    p.input ? `\nROUTES / SOURCE PROVIDED:\n${p.input}` : '\nNo routes pasted — infer the likely surface from the project description and mark every inferred endpoint "TO CONFIRM:".',
  ].join('\n'),
  sections: () => [
    { title: 'Overview', brief: 'Base URL, auth scheme, content types, versioning, rate limits, and shared error envelope.' },
    { title: 'Endpoints', brief: 'Full reference for every endpoint or server action, grouped by feature. This is the long section — be exhaustive.' },
    { title: 'Data shapes', brief: 'Every request and response object as a typed table, plus the enums and their allowed values.' },
    { title: 'Errors and edge cases', brief: 'Complete status-code table, retry guidance, idempotency, and the failure modes worth knowing about.' },
  ],
};
