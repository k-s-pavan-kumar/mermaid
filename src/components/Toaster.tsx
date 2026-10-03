'use client';

import { useEffect, useState } from 'react';
import type { ToastDetail } from '@/lib/toast';

/** Mounted once in the root layout. Shows the result of an action so a click
 *  never ends in silence — success, failure, and why. */
export function Toaster() {
  const [items, setItems] = useState<ToastDetail[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const t = (e as CustomEvent<ToastDetail>).detail;
      setItems((cur) => [...cur.slice(-3), t]);
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === 'error' ? 8000 : 3500);
    }
    window.addEventListener('meridian:toast', onToast);
    return () => window.removeEventListener('meridian:toast', onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-ico" aria-hidden="true">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}</span>
          <div>
            <div className="toast-msg">{t.message}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
