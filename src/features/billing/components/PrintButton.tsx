'use client';

/**
 * PDF export without a PDF library.
 *
 * The document is laid out in print CSS, so the browser's own "Save as PDF"
 * produces a clean, selectable, correctly-paginated file — no server-side
 * renderer, no extra dependency, no font packaging, and it looks identical
 * to what's on screen. It also means "print and post it" works.
 */
export function PrintButton({ label = 'Download PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      {label}
    </button>
  );
}
