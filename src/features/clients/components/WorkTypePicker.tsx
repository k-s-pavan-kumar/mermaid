'use client';

import { useEffect, useRef, useState } from 'react';
import { WORK_TYPES } from '../types';
import { MAX_TAGS_PER_CLIENT, MAX_TAG_LENGTH, isBuiltInWorkType, normalizeWorkTypes, workTypeColor, workTypeLabel } from '../work-types';

/**
 * What you do for this client — multi-select, because the single "type"
 * dropdown forced a choice that was wrong within a month: a web build turns
 * into a retainer, and the same client books a training day.
 *
 * The nine built-in kinds are always there. "+ Add tag" creates your own
 * (SEO, Photography, …); a tag you've used on any client is offered again as
 * a chip on the next one (`customTags`, built server-side from your clients).
 *
 * Posts repeated `work_types` fields, read with FormData.getAll().
 */
export function WorkTypePicker({ initial = [], customTags = [] }: { initial?: string[]; customTags?: string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  // Custom tags created in this form but not saved yet.
  const [fresh, setFresh] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  // Built-ins first, then every custom tag we know about (library, this client's own, just-added).
  const customs = normalizeWorkTypes([...customTags, ...initial, ...fresh]).filter((t) => !isBuiltInWorkType(t));
  const chips = [...WORK_TYPES as string[], ...customs];

  function toggle(t: string) {
    setNote('');
    setSelected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  function commitDraft() {
    const [tag] = normalizeWorkTypes([draft], customs);
    setDraft('');
    if (!tag) return;
    if (selected.some((s) => s.toLowerCase() === tag.toLowerCase())) { setNote(`“${workTypeLabel(tag)}” is already selected.`); return; }
    if (selected.length >= MAX_TAGS_PER_CLIENT) { setNote(`That's the maximum of ${MAX_TAGS_PER_CLIENT} tags.`); return; }
    setNote('');
    if (!isBuiltInWorkType(tag) && !customs.some((c) => c.toLowerCase() === tag.toLowerCase())) setFresh((f) => [...f, tag]);
    setSelected((cur) => [...cur, tag]);
  }

  return (
    <div>
      <div className="type-picker">
        {chips.map((t) => {
          const on = selected.some((s) => s.toLowerCase() === t.toLowerCase());
          const color = workTypeColor(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(selected.find((s) => s.toLowerCase() === t.toLowerCase()) ?? t)}
              className={`type-chip${on ? ' on' : ''}`}
              style={on ? { borderColor: color, color } : undefined}
              aria-pressed={on}
            >
              <span className="type-dot" style={{ background: color }} />
              {workTypeLabel(t)}
            </button>
          );
        })}
        {!adding && (
          <button type="button" className="type-chip add" onClick={() => setAdding(true)}>+ Add tag</button>
        )}
      </div>

      {adding && (
        <div className="type-add">
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            placeholder="e.g. SEO, Photography, Video editing"
            aria-label="New tag"
            onChange={(e) => { setDraft(e.target.value); setNote(''); }}
            onKeyDown={(e) => {
              // Enter adds the tag — it must never submit the surrounding client form.
              if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
              if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft(''); setNote(''); }
            }}
          />
          <button type="button" className="mini-btn" onClick={commitDraft} disabled={!draft.trim()}>Add</button>
          <button type="button" className="mini-btn ghost" onClick={() => { setAdding(false); setDraft(''); setNote(''); }}>Done</button>
        </div>
      )}
      {note && <p role="status" className="text-sm" style={{ margin: '6px 0 0', color: 'var(--rust)' }}>{note}</p>}

      {selected.map((t) => (
        <input key={t} type="hidden" name="work_types" value={t} />
      ))}
      <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
        Pick every kind of work you do for them — none is a valid answer for a brand new lead.
        Don’t see yours? Add your own tag; it will be offered on your other clients too.
      </p>
    </div>
  );
}
