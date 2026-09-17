'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import type { ProjectPhase } from '../types';

/**
 * The timeline bar plus an editor for the phases behind it.
 *
 * Previously a phase was write-once: the colour and width you picked in the
 * Add form were final, and the only way to change either was to delete and
 * re-add (which also lost its position). Everything is editable in place
 * now, and the bar above updates live as you change a colour or width so
 * you can see the result before saving.
 */
export function PhaseEditor({
  phases,
  updatePhase,
  deletePhase,
  movePhase,
}: {
  phases: ProjectPhase[];
  updatePhase: (phaseId: string, formData: FormData) => Promise<void>;
  deletePhase: (phaseId: string) => Promise<void>;
  movePhase: (phaseId: string, direction: -1 | 1) => Promise<void>;
}) {
  // Local overrides so the preview bar tracks the inputs before a save.
  const [draft, setDraft] = useState<Record<string, { color?: string; width?: number; label?: string }>>({});

  function view(ph: ProjectPhase) {
    const d = draft[ph.id] ?? {};
    return {
      color: d.color ?? ph.color,
      width: d.width ?? ph.width_pct,
      label: d.label ?? ph.label,
    };
  }

  function patch(id: string, p: { color?: string; width?: number; label?: string }) {
    setDraft((cur) => ({ ...cur, [id]: { ...cur[id], ...p } }));
  }

  const total = phases.reduce((sum, ph) => sum + view(ph).width, 0);

  if (phases.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">No phases yet</div>
          Add one below to sketch the timeline.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="table-wrap" style={{ padding: 0, marginBottom: 6 }}>
        <div style={{ display: 'flex', height: 30, minWidth: 400 }}>
          {phases.map((ph) => {
            const v = view(ph);
            return (
              <div
                key={ph.id}
                style={{
                  width: `${v.width}%`,
                  minWidth: 60,
                  background: v.color,
                  color: '#fff',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  fontWeight: 500,
                }}
              >
                {v.label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 14 }}>
        Widths total {Math.round(total)}%
        {Math.round(total) !== 100 && ' — they only fill the bar proportionally, so 100% reads cleanest.'}
      </div>

      <div className="card" style={{ padding: '6px 14px' }}>
        {phases.map((ph) => {
          const v = view(ph);
          return (
            <div key={ph.id} className="phase-edit-row">
              <form action={updatePhase.bind(null, ph.id)} className="phase-edit-form">
                <input
                  type="color"
                  name="color"
                  value={v.color}
                  onChange={(e) => patch(ph.id, { color: e.target.value })}
                  title="Phase colour"
                  aria-label={`Colour for ${ph.label}`}
                  className="phase-color"
                />
                <input
                  name="label"
                  value={v.label}
                  onChange={(e) => patch(ph.id, { label: e.target.value })}
                  aria-label={`Label for ${ph.label}`}
                  required
                />
                <span className="phase-width">
                  <input
                    name="width_pct"
                    type="number"
                    min={1}
                    max={100}
                    value={v.width}
                    onChange={(e) => patch(ph.id, { width: Number(e.target.value) })}
                    aria-label={`Width for ${ph.label}`}
                  />
                  <span className="text-muted">%</span>
                </span>
                <SubmitButton className="btn-inline" pendingLabel="Saving…">
                  Save
                </SubmitButton>
              </form>

              <span className="phase-edit-tools">
                <ActionButton
                  action={() => movePhase(ph.id, -1)}
                  className="btn-ghost icon-btn"
                  title="Move earlier"
                  aria-label="Move phase earlier"
                >
                  ‹
                </ActionButton>
                <ActionButton
                  action={() => movePhase(ph.id, 1)}
                  className="btn-ghost icon-btn"
                  title="Move later"
                  aria-label="Move phase later"
                >
                  ›
                </ActionButton>
                <ActionButton
                  action={() => deletePhase(ph.id)}
                  className="btn-link"
                  confirm={`Delete the "${ph.label}" phase?`}
                  pendingLabel="Deleting…"
                >
                  Delete
                </ActionButton>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
