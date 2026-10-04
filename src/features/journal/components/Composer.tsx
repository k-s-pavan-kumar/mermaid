'use client';

import { useEffect, useRef } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { addJournalEntry } from '../actions';
import { MAX_ENTRY_CHARS } from '../types';

/** Quick-capture box. ⌘/Ctrl+Enter saves; React 19 clears the field once the action finishes. */
export function Composer({ date, autoFocus = false }: { date: string; autoFocus?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Only grab focus when asked to (arriving from a reminder click). Grabbing it
  // on every visit would swallow the g-then-letter navigation shortcuts.
  useEffect(() => { if (autoFocus) areaRef.current?.focus(); }, [autoFocus]);

  return (
    <form ref={formRef} action={addJournalEntry} className="journal-composer">
      <input type="hidden" name="date" value={date} />
      <textarea
        ref={areaRef}
        name="content"
        rows={4}
        maxLength={MAX_ENTRY_CHARS}
        placeholder="What’s on your mind? Thoughts, worries, wins, loose ends…"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <div className="journal-composer-foot">
        <span className="text-muted" style={{ fontSize: 11.5 }}>
          <kbd className="kbd">Ctrl</kbd>/<kbd className="kbd">⌘</kbd> + <kbd className="kbd">Enter</kbd> to save
        </span>
        <SubmitButton className="btn" pendingLabel="Saving…">Add to journal</SubmitButton>
      </div>
    </form>
  );
}
