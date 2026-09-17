'use client';

import { useFormStatus } from 'react-dom';

/**
 * Submit button that knows whether its own <form> is mid-flight.
 *
 * useFormStatus() only reports the status of the nearest parent form, which
 * is exactly why this has to be its own component rather than inline JSX —
 * a button rendered directly inside the form would always read `pending:
 * false`. Every server-action form in the app uses this so a click always
 * produces visible feedback instead of a frozen-looking page.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn',
  style,
  confirm,
  title,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  confirm?: string;
  title?: string;
  'aria-label'?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`${className} is-async${pending ? ' is-pending' : ''}`}
      style={style}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <span className="spin" aria-hidden="true" />}
      <span>{pending ? pendingLabel ?? children : children}</span>
    </button>
  );
}
