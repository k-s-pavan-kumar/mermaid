'use client';

import { useState, useTransition } from 'react';
import { createTagByName } from '@/features/tags/actions';
import {
  MAX_CUSTOM_TAG_LENGTH, MAX_WORK_TAGS, WORK_TYPES, normaliseWorkTag, workTypeColor, workTypeLabel, type WorkType,
} from '../types';

/**
 * What you do for this client — multi-select, because the single "type"
 * dropdown forced a choice that was wrong within a month: a web build turns
 * into a retainer, and the same client books a training day.
 *
 * The built-in tags can be joined by your own: type a name and press Enter
 * (or "Add tag") and it is created and ticked. `library` carries the custom
 * tags already used on other clients, so a tag you made once is one click
 * away next time.
 *
 * Posts repeated `work_types` fields, read with FormData.getAll().
 */
export function WorkTypePicker({ initial = [], library = [] }: { initial?: WorkType[]; library?: string[] }) {
  const [selected, setSelected] = useState<WorkType[]>(initial);
  // Custom tags on offer: ones from other clients, ones already on this client, and any added in this form.
  // A library name that is really a built-in ("Teaching" vs 'teaching') is shown once, as the built-in.
  const [custom, setCustom] = useState<string[]>(() =>
    dedupe([...library, ...initial].filter((t) => normaliseWorkTag(t) === t && !WORK_TYPES.includes(t as never))));
  const [saving, startSave] = useTransition();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);

  function toggle(t: WorkType) {
    setSelected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  function addDraft() {
    const tag = normaliseWorkTag(draft);
    if (!tag) return;
    const existing = [...WORK_TYPES, ...custom].find((t) => t.toLowerCase() === tag.toLowerCase());
    const use = existing ?? tag;
    if (!selected.some((s) => s.toLowerCase() === use.toLowerCase()) && selected.length >= MAX_WORK_TAGS) {
      setNote(`At most ${MAX_WORK_TAGS} tags per client.`);
      return;
    }
    const tick = (name: string) => setSelected((cur) => (cur.some((s) => s.toLowerCase() === name.toLowerCase()) ? cur : [...cur, name]));
    if (existing) {
      tick(use);
      setNote(`"${workTypeLabel(use)}" already exists — ticked it for you.`);
      setDraft('');
      return;
    }
    // New tag: save it to the shared tags table right now, so it is still there
    // after leaving this page and shows up on goals and the Tags page too —
    // whether or not this client form is submitted.
    startSave(async () => {
      const res = await createTagByName(use);
      if (!res.ok) { setNote(res.message); return; }
      setCustom((c) => dedupe([...c, res.name]));
      tick(res.name);
      setNote(null);
      setDraft('');
    });
  }

  const all: WorkType[] = [...WORK_TYPES, ...custom];

  return (
    <div>
      <div className="type-picker">
        {all.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`type-chip${on ? ' on' : ''}`}
              style={on ? { borderColor: workTypeColor(t), color: workTypeColor(t) } : undefined}
              aria-pressed={on}
            >
              <span className="type-dot" style={{ background: workTypeColor(t) }} />
              {workTypeLabel(t)}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, maxWidth: 360 }}>
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setNote(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
          maxLength={MAX_CUSTOM_TAG_LENGTH}
          placeholder="Add your own tag, e.g. Photography"
          aria-label="New work type tag"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn-ghost" onClick={addDraft} disabled={!draft.trim() || saving}>{saving ? 'Saving…' : 'Add tag'}</button>
      </div>
      {note && <p className="text-muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>{note}</p>}

      {selected.map((t) => (
        <input key={t} type="hidden" name="work_types" value={t} />
      ))}
      <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
        Pick every kind of work you do for them — none is a valid answer for a brand new lead. Tags you add are saved to your Tags list and offered everywhere.
      </p>
    </div>
  );
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
