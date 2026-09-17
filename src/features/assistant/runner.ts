import { table } from '@/lib/data';
import { todayIso } from '@/lib/tz/today';
import { getSettings } from '@/features/settings/queries';
import { getProjectById, getProjects } from '@/features/projects/queries';
import { getClientById } from '@/features/clients/queries';
import { getSkill } from './skills';
import type { Skill, SkillPayload } from './skills/types';
import type { Task } from '@/features/today/types';
import type { Note } from '@/features/notes/types';
import type { Meeting } from '@/features/meetings/types';

/**
 * Runs a skill against a real model endpoint.
 *
 * Long documents are built section by section. That is not an optimisation —
 * a single completion cannot produce twenty pages before it hits the output
 * ceiling, and quality degrades long before that. Each section call carries
 * the same project context plus the full outline and the headings written so
 * far, so the pieces agree with each other without the model needing to hold
 * the whole document in one response.
 */

export interface SkillRunResult {
  ok: boolean;
  /** Markdown for 'note'/'text' skills. */
  content?: string;
  /** Created task titles for 'tasks' skills. */
  tasks?: string[];
  noteId?: string;
  notePath?: string;
  error?: string;
}

function config() {
  return {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
  };
}

async function complete(system: string, user: string, maxTokens: number): Promise<string> {
  const { apiKey, baseUrl, model } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Model endpoint returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? '').trim();
}

/** Gathers everything a skill might read. Cheap enough to do unconditionally. */
export async function buildPayload(
  ownerId: string,
  opts: { projectId?: string | null; clientId?: string | null; input?: string }
): Promise<SkillPayload> {
  const settings = await getSettings(ownerId);
  const today = todayIso();

  const project = opts.projectId ? await getProjectById(opts.projectId) : undefined;
  const client = opts.clientId ? await getClientById(opts.clientId) : undefined;

  const [allTasks, notes, meetings, projects] = await Promise.all([
    table<Task>('tasks').where((t) => t.owner_id === ownerId),
    table<Note>('notes').where((n) => n.owner_id === ownerId),
    client ? table<Meeting>('meetings').where((m) => m.client_id === client.id) : Promise.resolve([]),
    getProjects(),
  ]);

  // "Last touched" is the most recent task activity on a project — the only
  // honest signal of whether something is actually alive.
  const staleProjects = projects.map((p) => {
    const touched = allTasks
      .filter((t) => t.project_id === p.id)
      .map((t) => t.scheduled_date ?? t.dump_date ?? t.created_at.slice(0, 10))
      .sort()
      .pop();
    return { name: p.name, status: p.status, lastTouched: touched ?? null };
  });

  return {
    ownerId,
    today,
    input: opts.input ?? '',
    settings,
    project: project as SkillPayload['project'],
    projectTasks: project ? allTasks.filter((t) => t.project_id === project.id) : undefined,
    projectNotes: project ? notes.filter((n) => n.project_id === project.id) : undefined,
    client,
    clientMeetings: meetings,
    recentTasks: allTasks
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100),
    staleProjects,
  };
}

/** Generate a long document section by section and stitch it together. */
async function runSectioned(skill: Skill, payload: SkillPayload): Promise<string> {
  const sections = skill.sections!(payload);
  const outline = sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const base = skill.prompt(payload);
  const parts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const user = [
      base,
      `\nFULL DOCUMENT OUTLINE (for consistency — do not write the other sections):\n${outline}`,
      parts.length > 0 ? `\nSECTIONS ALREADY WRITTEN: ${sections.slice(0, i).map((s) => s.title).join(', ')}. Do not repeat their content; refer back to them by name where useful.` : '',
      `\nWRITE SECTION ${i + 1}: "${section.title}"`,
      `What this section must cover: ${section.brief}`,
      `\nStart with the markdown heading "## ${section.title}" and write only this section. Be thorough — this is a reference document, not a summary. Aim for 600–1200 words unless the section is genuinely shorter by nature.`,
    ].join('\n');

    parts.push(await complete(skill.system, user, skill.maxTokens ?? 3000));
  }

  return parts.join('\n\n');
}

export async function runSkill(
  skillId: string,
  ownerId: string,
  opts: { projectId?: string | null; clientId?: string | null; input?: string }
): Promise<SkillRunResult> {
  const skill = getSkill(skillId);
  if (!skill) return { ok: false, error: 'Unknown skill.' };

  if (!config().apiKey) {
    return { ok: false, error: 'Set GROQ_API_KEY in .env to use skills, then restart the dev server.' };
  }

  const payload = await buildPayload(ownerId, opts);

  if (skill.needs.includes('project') && !payload.project) return { ok: false, error: 'Pick a project first.' };
  if (skill.needs.includes('client') && !payload.client) return { ok: false, error: 'Pick a client first.' };
  if (skill.needs.includes('input') && !payload.input.trim()) return { ok: false, error: 'This skill needs a line of context from you first.' };

  try {
    const content = skill.sections
      ? await runSectioned(skill, payload)
      : await complete(skill.system, skill.prompt(payload), skill.maxTokens ?? 1200);

    if (skill.output === 'tasks') {
      // The model is asked for bare JSON, but models add fences anyway.
      const cleaned = content.replace(/```json|```/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      let titles: string[] = [];
      try {
        titles = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Fall back to line parsing rather than losing the whole result.
        titles = cleaned
          .split('\n')
          .map((l) => l.replace(/^[-*\d.)\s"]+|["',]+$/g, '').trim())
          .filter((l) => l.length > 3);
      }
      return { ok: true, tasks: titles.filter((t) => typeof t === 'string').slice(0, 15), content };
    }

    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The skill run failed.' };
  }
}
