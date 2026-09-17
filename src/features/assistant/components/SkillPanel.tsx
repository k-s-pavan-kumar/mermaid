'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillRunResult } from '../runner';

export interface SkillCard {
  id: string;
  label: string;
  blurb: string;
  mascot: string;
  needs: string[];
  inputLabel?: string;
  inputPlaceholder?: string;
  output: 'note' | 'tasks' | 'text';
  long: boolean;
}

/**
 * The skill buttons.
 *
 * Rendered entirely from the registry, so a skill added in
 * features/assistant/skills/ appears here with no change to this file or to
 * any page. Long documents take a while to generate — they are many model
 * calls, not one — so the running state says so rather than looking hung.
 */
export function SkillPanel({
  skills,
  projectId,
  clientId,
  projects,
  run,
  title = 'Skills',
  intro,
}: {
  skills: SkillCard[];
  projectId?: string;
  clientId?: string;
  /** When no projectId is fixed by the page, let the user pick one. */
  projects?: { id: string; name: string }[];
  run: (formData: FormData) => Promise<SkillRunResult>;
  title?: string;
  intro?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<SkillCard | null>(null);
  const [input, setInput] = useState('');
  const [pickedProject, setPickedProject] = useState(projectId ?? '');
  const [result, setResult] = useState<SkillRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  function launch(skill: SkillCard) {
    setOpen(skill);
    setResult(null);
    setInput('');
  }

  function submit() {
    if (!open || pending) return;
    const formData = new FormData();
    formData.set('skill', open.id);
    if (pickedProject) formData.set('project_id', pickedProject);
    if (clientId) formData.set('client_id', clientId);
    formData.set('input', input);

    startTransition(async () => {
      const res = await run(formData);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  const needsProject = open?.needs.includes('project') && !pickedProject;
  const needsInput = open?.needs.includes('input') && !input.trim();

  return (
    <div>
      <div className="section-title"><h3>{title}</h3></div>
      {intro && <p className="text-muted text-sm" style={{ marginTop: -4 }}>{intro}</p>}

      <div className="skill-grid">
        {skills.map((s) => (
          <button key={s.id} type="button" className={`skill-card${open?.id === s.id ? ' on' : ''}`} onClick={() => launch(s)}>
            <img src={`/mascot/${s.mascot}.png`} alt="" width={44} height={44} />
            <span>
              <strong>{s.label}</strong>
              <span className="skill-blurb">{s.blurb}</span>
              <span className="skill-tags">
                <span className="skill-tag">{s.output === 'note' ? 'writes a note' : s.output === 'tasks' ? 'creates tasks' : 'answers here'}</span>
                {s.long && <span className="skill-tag long">long — takes a minute</span>}
              </span>
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div className="card skill-run">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{open.label}</h3>
            <button type="button" className="btn-link" onClick={() => setOpen(null)} aria-label="Close">×</button>
          </div>

          {projects && !projectId && (
            <div style={{ marginTop: 10 }}>
              <label className="field-label" htmlFor="skill_project">Project</label>
              <select id="skill_project" value={pickedProject} onChange={(e) => setPickedProject(e.target.value)} style={{ width: '100%' }}>
                <option value="">— none —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {(open.inputLabel || open.needs.includes('input')) && (
            <div style={{ marginTop: 10 }}>
              <label className="field-label" htmlFor="skill_input">{open.inputLabel ?? 'Context'}</label>
              <textarea
                id="skill_input"
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={open.inputPlaceholder}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className={`btn is-async${pending ? ' is-pending' : ''}`} onClick={submit} disabled={pending || needsProject || needsInput}>
              {pending && <span className="spin" aria-hidden="true" />}
              <span>{pending ? (open.long ? 'Writing — this takes a minute…' : 'Working…') : 'Run skill'}</span>
            </button>
            {needsProject && <span className="text-muted text-sm">Pick a project first.</span>}
            {needsInput && !needsProject && <span className="text-muted text-sm">Add a line of context first.</span>}
          </div>

          {result && !result.ok && <p className="scaffold-result bad">× {result.error}</p>}

          {result?.ok && result.tasks && (
            <div className="scaffold-result ok">
              ✓ Added {result.tasks.length} steps to your brain dump:
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {result.tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {result?.ok && result.noteId && (
            <p className="scaffold-result ok">
              ✓ Written to <span className="mono">{result.notePath}</span> — <a href="/notes">open in Notes</a>
            </p>
          )}

          {result?.ok && !result.noteId && !result.tasks && result.content && (
            <div className="skill-output">{result.content}</div>
          )}
        </div>
      )}
    </div>
  );
}
