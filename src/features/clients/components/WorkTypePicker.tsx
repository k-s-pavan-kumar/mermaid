'use client';

import { useState } from 'react';
import { WORK_TYPES, WORK_TYPE_COLOR, WORK_TYPE_LABEL, type WorkType } from '../types';

/**
 * What you do for this client — multi-select, because the single "type"
 * dropdown forced a choice that was wrong within a month: a web build turns
 * into a retainer, and the same client books a training day.
 *
 * Posts repeated `work_types` fields, read with FormData.getAll().
 */
export function WorkTypePicker({ initial = [] }: { initial?: WorkType[] }) {
  const [selected, setSelected] = useState<WorkType[]>(initial);

  function toggle(t: WorkType) {
    setSelected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  return (
    <div>
      <div className="type-picker">
        {WORK_TYPES.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`type-chip${on ? ' on' : ''}`}
              style={on ? { borderColor: WORK_TYPE_COLOR[t], color: WORK_TYPE_COLOR[t] } : undefined}
              aria-pressed={on}
            >
              <span className="type-dot" style={{ background: WORK_TYPE_COLOR[t] }} />
              {WORK_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      {selected.map((t) => (
        <input key={t} type="hidden" name="work_types" value={t} />
      ))}
      <p className="text-muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
        Pick every kind of work you do for them — none is a valid answer for a brand new lead.
      </p>
    </div>
  );
}
