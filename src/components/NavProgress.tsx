'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Instant feedback for navigation. The moment a link is clicked (or a plain
 * HTML form is submitted) a bar runs across the top, the content dims, and
 * the clicked sidebar item shows a spinner — before the server has answered.
 * It clears when the route actually changes. Forms driven by server actions
 * are NOT handled here; their SubmitButton shows its own pending state.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);
  const failsafe = useRef<number | undefined>(undefined);

  // Route changed → navigation finished.
  useEffect(() => { stop(); }, [pathname, search]);

  function start(el?: Element | null) {
    setActive(true);
    document.body.dataset.navigating = 'true';
    el?.classList.add('is-loading');
    window.clearTimeout(failsafe.current);
    // If something cancels the navigation (download link, blocked redirect)
    // never leave the UI dimmed forever.
    failsafe.current = window.setTimeout(stop, 15000);
  }
  function stop() {
    setActive(false);
    delete document.body.dataset.navigating;
    document.querySelectorAll('.is-loading').forEach((n) => n.classList.remove('is-loading'));
    window.clearTimeout(failsafe.current);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / #hash
      start(a.classList.contains('nav-item') ? a : null);
    }
    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      const attr = form.getAttribute('action') ?? '';
      // React server-action forms have a javascript: action — skip them.
      if (e.defaultPrevented || !/^(\/|https?:)/.test(attr)) return;
      start();
      const btn = (e.submitter ?? form.querySelector('button[type=submit]')) as HTMLButtonElement | null;
      if (btn) {
        btn.setAttribute('aria-busy', 'true');
        // Disable on the next tick — disabling during the event would drop the submit.
        window.setTimeout(() => { btn.disabled = true; btn.classList.add('is-async', 'is-pending'); }, 0);
      }
    }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) stop(); } // back/forward cache
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return <div className={`nav-progress${active ? ' on' : ''}`} aria-hidden="true" />;
}
