'use client';

import { useState } from 'react';
import { TYPE_COLOR, TYPE_HINT, TYPE_LABEL, TYPE_ORDER } from '@/lib/project-colors';
import type { ProjectType } from '../types';

/**
 * Multi-select for project types.
 *
 * A dropdown forced one label onto projects that are genuinely several
 * things at once (an open-source repo that's also a web app; client work
 * that's also an assessment). Selection order is preserved and the first
 * pick is the primary type — it drives the dot colour in lists and the
 * badge on Today — so the "primary" chip is shown explicitly rather than
 * left for the user to infer.
 *
 * Values post as repeated `types` fields, which FormData.getAll() reads on
 * the server with no extra parsing.
 */
export function ProjectTypePicker({
  initial = ['client'],
  name = 'types',
}: {
  initial?: ProjectType[];
  name?: string;
}) {
  const [selected, setSelected] = useState<ProjectType[]>(initial.length > 0 ? initial : ['client']);
  const primary: ProjectType = selected[0] ?? 'client';

  function toggle(t: ProjectType) {
    setSelected((cur) => {
      if (cur.includes(t)) {
        // Never let the last one go — a project with no type can't be
        // filtered, coloured or routed to the right tabs.
        return cur.length === 1 ? cur : cur.filter((x) => x !== t);
      }
      return [...cur, t];
    });
  }

  return (
    <div>
      <div className="type-picker">
        {TYPE_ORDER.map((t) => {
          const on = selected.includes(t);
          const isPrimary = primary === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`type-chip${on ? ' on' : ''}`}
              style={on ? { borderColor: TYPE_COLOR[t], color: TYPE_COLOR[t] } : undefined}
              title={TYPE_HINT[t]}
              aria-pressed={on}
            >
              <span className="type-dot" style={{ background: TYPE_COLOR[t] }} />
              {TYPE_LABEL[t]}
              {isPrimary && <span className="type-chip-primary">primary</span>}
            </button>
          );
        })}
      </div>

      {selected.map((t) => (
        <input key={t} type="hidden" name={name} value={t} />
      ))}

      <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
        Pick as many as fit — the first one is the primary type. {TYPE_HINT[primary]}
      </p>
    </div>
  );
}
