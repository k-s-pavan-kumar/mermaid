'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from '@/lib/toast';

/**
 * For the places that call a server action from onClick rather than a form
 * submit (the Today board, row-level delete buttons). Same contract as
 * SubmitButton from the user's point of view: the control disables itself,
 * shows a spinner, and stays disabled until the refresh lands — so a slow
 * action can't be double-fired and never looks like nothing happened.
 */
export function ActionButton({
  action,
  children,
  pendingLabel,
  className = 'btn-ghost',
  style,
  confirm,
  title,
  refresh = true,
  disabled = false,
  successMessage,
  'aria-label': ariaLabel,
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  confirm?: string;
  title?: string;
  refresh?: boolean;
  disabled?: boolean;
  /** Toast shown when the action completes without throwing. */
  successMessage?: string;
  'aria-label'?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const busy = isPending || running;

  function run() {
    if (busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setRunning(true);
    startTransition(async () => {
      try {
        await action();
        if (refresh) router.refresh();
        if (successMessage) toast(successMessage, 'success');
      } catch (e) {
        // Server-action failures used to bubble to the error page; show them
        // where the click happened instead.
        toast('That didn\u2019t work', 'error', e instanceof Error ? e.message : undefined);
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      className={`${className} is-async${busy ? ' is-pending' : ''}`}
      style={style}
      title={title}
      aria-label={ariaLabel}
      aria-busy={busy}
      disabled={busy || disabled}
    >
      {busy && <span className="spin" aria-hidden="true" />}
      <span>{busy ? pendingLabel ?? children : children}</span>
    </button>
  );
}
