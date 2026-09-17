import type { Skill } from './types';
import { projectBrief, NO_INVENTION } from './context';

/**
 * The big one: a full project/handover document, generated section by
 * section so it actually reaches twenty-plus pages instead of the
 * two-page summary a single call produces before it runs out of room.
 */
export const projectHandover: Skill = {
  id: 'project-handover',
  label: 'Project & handover document',
  blurb: 'Long-form: architecture, folder structure, stack decisions and the reasoning behind them. 20+ pages.',
  mascot: 'checklist',
  surfaces: ['project', 'notes'],
  needs: ['project'],
  inputLabel: 'Anything the record does not know (stack, hosting, quirks)',
  inputPlaceholder: 'e.g. Next.js 15 App Router, Supabase, Vercel, Tailwind — auth is a signed cookie for now',
  output: 'note',
  maxTokens: 4000,
  noteFolder: 'Projects',
  tags: ['handover', 'documentation'],
  noteTitle: (p) => `${p.project?.name ?? 'Project'} — Project & handover document`,
  system: [
    'You are a staff engineer writing the document a new maintainer reads on day one.',
    'Write in plain, direct prose with short paragraphs. Use markdown headings, tables and fenced code blocks.',
    'Prefer concrete detail over generalities: real folder names, real commands, real file paths.',
    'Explain WHY behind every choice, including what was rejected and the trade-off accepted.',
    NO_INVENTION,
  ].join(' '),
  prompt: (p) => [
    projectBrief(p),
    p.input ? `\nEXTRA CONTEXT FROM THE OWNER:\n${p.input}` : '',
    '\nYou are writing one section of a long handover document. Stay inside your assigned section; do not summarise the whole document or repeat other sections.',
  ].join('\n'),
  sections: (p) => {
    const name = p.project?.name ?? 'the project';
    return [
      { title: 'Executive summary', brief: `What ${name} is, who it is for, the problem it solves, current status, and what "done" means. Include a one-paragraph elevator description and a status table.` },
      { title: 'Product scope', brief: 'Users and their jobs-to-be-done, the core flows in order, what is explicitly out of scope and why.' },
      { title: 'Technology stack', brief: 'Every language, framework, library and service, in a table: what it is, the version line, what it is used for, and why it was chosen over the obvious alternative.' },
      { title: 'Architecture', brief: 'How the pieces fit: rendering model, data flow from request to storage and back, boundaries between layers, and where state lives. Include an ASCII or mermaid diagram.' },
      { title: 'Repository and folder structure', brief: 'An annotated tree of the repo to two or three levels, with one line per folder explaining what belongs there and — importantly — what does NOT, so the structure survives contact with new code.' },
      { title: 'Data model', brief: 'Every entity, its fields and types, relationships, and the reasoning behind denormalisation or nullable columns. Include the migration story.' },
      { title: 'API surface', brief: 'Every endpoint and server action: method, path, auth requirement, request shape, response shape, error cases, and an example call. Group by feature. If the project uses server actions rather than HTTP routes, document those the same way.' },
      { title: 'Key design decisions', brief: 'ADR-style entries: context, options considered, decision, consequences, and what would make you revisit it. At least six decisions.' },
      { title: 'Environment and configuration', brief: 'Every environment variable: what it does, whether it is required, what happens when it is missing, and where to get the value. Include a safe example .env.' },
      { title: 'Local development', brief: 'From a clean machine to a running app: prerequisites, commands in order, seeding, common first-run errors and their fixes.' },
      { title: 'Testing and verification', brief: 'What is tested, how to run it, what is deliberately untested and the risk that carries, and the manual checks before a release.' },
      { title: 'Deployment and operations', brief: 'Build, environments, release steps, rollback, monitoring, logs, and the runbook for the three most likely incidents.' },
      { title: 'Security and privacy', brief: 'Authentication, authorisation, secret handling, data retention, third-party data exposure, and the known gaps with their severity.' },
      { title: 'Performance and cost', brief: 'Where time and money go, current known limits, and the first three things to optimise when it matters.' },
      { title: 'Known issues and technical debt', brief: 'An honest register: issue, impact, effort to fix, and whether it is deliberate debt or an accident.' },
      { title: 'Roadmap and next steps', brief: 'Sequenced next work with reasoning for the order, plus the parked ideas and why they are parked.' },
      { title: 'Handover checklist', brief: 'Accounts, access, domains, credentials-to-transfer (named, never valued), recurring obligations, and who to contact for what. End with a checklist a new owner can tick through.' },
    ];
  },
};
