'use client';

import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/ActionButton';

/**
 * Delete controls for one row of a project's to-do list.
 *
 * A plain task gets a single × . A task made by Repeat gets a small menu
 * next to it so one wrong day (a festival, a leave day) can be removed on
 * its own, or the whole rest of the series cleared in one go.
 *
 * The three actions are server actions bound by the page, so this stays a
 * thin client shell: it only owns the open/closed state of the menu.
 */
export function TaskRowMenu({
  isSeries, dateLabel, deleteOne, deleteLater, deleteAll,
}: {
  isSeries: boolean;
  dateLabel: string | null;
  deleteOne: () => Promise<void>;
  deleteLater: () => Promise<void>;
  deleteAll: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const when = dateLabel ? ` on ${dateLabel}` : '';

  if (!isSeries) {
    return (
      <ActionButton
        action={deleteOne}
        className="df-del"
        title="Delete this task"
        aria-label="Delete this task"
        pendingLabel="…"
        confirm={`Delete this task${when}?`}
      >
        ×
      </ActionButton>
    );
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="df-del"
        title="Repeating task — delete options"
        aria-label="Delete options for this repeating task"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 13 }}
      >
        ↻ ×
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20, minWidth: 230,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 6px 20px rgba(27,18,64,.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <ActionButton
            action={async () => { await deleteOne(); setOpen(false); }}
            className="btn-ghost" pendingLabel="Deleting…"
            style={{ textAlign: 'left', border: 'none' }}
            confirm={`Delete only this day${when}? The rest of the series stays.`}
          >
            Delete only this day
          </ActionButton>
          <ActionButton
            action={async () => { await deleteLater(); setOpen(false); }}
            className="btn-ghost" pendingLabel="Deleting…"
            style={{ textAlign: 'left', border: 'none' }}
            confirm={`Delete this day and every later day in this series? Days already ticked done are kept.`}
          >
            Delete this &amp; all later days
          </ActionButton>
          <ActionButton
            action={async () => { await deleteAll(); setOpen(false); }}
            className="btn-ghost" pendingLabel="Deleting…"
            style={{ textAlign: 'left', border: 'none', color: 'var(--crimson)' }}
            confirm="Delete the WHOLE series — every day, including ones already done? Hours logged on them go too."
          >
            Delete entire series
          </ActionButton>
        </div>
      )}
    </span>
  );
}
