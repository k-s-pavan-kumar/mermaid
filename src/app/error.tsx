'use client';

import { useEffect } from 'react';

// Shown instead of the bare "Application error: a server-side exception has
// occurred" page. In production Next.js hides the real message from the
// browser and gives only a digest; that digest is what to search for in the
// Vercel logs (Project → Logs) to find the actual cause.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ maxWidth: 520, margin: '12vh auto', padding: '0 20px' }}>
      <div className="card">
        <h3 style={{ fontSize: 18 }}>Something went wrong</h3>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
          That didn&apos;t save. Nothing was lost — your other data is untouched. Try again, and if it keeps
          happening, check the Vercel logs for the reference below.
        </p>
        {error.digest && (
          <p className="mono text-muted" style={{ fontSize: 12 }}>Reference: {error.digest}</p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => reset()}>Try again</button>
          <a className="btn-ghost" href="/today" style={{ textDecoration: 'none', display: 'inline-block' }}>Go to Today</a>
        </div>
      </div>
    </div>
  );
}
