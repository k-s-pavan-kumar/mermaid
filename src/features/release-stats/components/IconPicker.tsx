'use client';

import { useState, useTransition } from 'react';
import { ICON_CHOICES, firstGrapheme } from '../icon';
import { setCardIcon } from '../actions';
import { toast } from '@/lib/toast';

/** Curated grid + a box for any emoji (paste one, or open the OS picker:
 *  Win + . on Windows, Ctrl + Cmd + Space on macOS). Controlled by the parent. */
export function IconPicker({
  value, onChange, defaultIcon,
}: { value: string; onChange: (icon: string) => void; defaultIcon: string }) {
  const [custom, setCustom] = useState('');

  const pick = (icon: string) => { onChange(icon); setCustom(''); };

  return (
    <div className="icon-picker">
      <div className="icon-picker-top">
        <span className="icon-picker-preview" aria-hidden="true">{value}</span>
        <input
          aria-label="Type or paste any emoji"
          placeholder="Type or paste any emoji"
          value={custom}
          maxLength={16}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} // don't submit the surrounding Add/Edit form
          onChange={(e) => {
            const g = firstGrapheme(e.target.value);
            setCustom(g);
            if (g) onChange(g);
          }}
        />
        <button type="button" className="mini-btn ghost" disabled={value === defaultIcon} onClick={() => pick(defaultIcon)}>
          Reset
        </button>
      </div>
      {ICON_CHOICES.map((group) => (
        <div key={group.label}>
          <div className="icon-picker-label">{group.label}</div>
          <div className="icon-picker-grid">
            {group.icons.map((ic) => (
              <button
                key={ic}
                type="button"
                className={`icon-opt${ic === value ? ' selected' : ''}`}
                aria-pressed={ic === value}
                aria-label={`Use ${ic}`}
                onClick={() => pick(ic)}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The small modal behind the card's icon button: change it without opening the full edit form. */
export function CardIconModal({
  name, ids, current, defaultIcon, onClose,
}: { name: string; ids: string[]; current: string; defaultIcon: string; onClose: () => void }) {
  const [icon, setIcon] = useState(current);
  const [pending, startTransition] = useTransition();

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>Icon for {name}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <IconPicker value={icon} onChange={setIcon} defaultIcon={defaultIcon} />
        <div className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`btn is-async${pending ? ' is-pending' : ''}`}
            disabled={pending}
            onClick={() => startTransition(async () => {
              try {
                const r = await setCardIcon(ids, icon);
                toast(r.message, r.ok ? 'success' : 'error', r.detail);
                if (r.ok) onClose();
              } catch (e) {
                toast('Couldn’t change the icon', 'error', e instanceof Error ? e.message : undefined);
              }
            })}
          >
            {pending && <span className="spin" aria-hidden="true" />}
            <span>{pending ? 'Saving…' : 'Save icon'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
