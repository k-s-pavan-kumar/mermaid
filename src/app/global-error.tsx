'use client';

// Last-resort boundary for errors thrown in the root layout itself.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '12vh 20px', maxWidth: 520, margin: '0 auto' }}>
        <h2>Something went wrong</h2>
        <p>Please reload the page. If it keeps happening, check the server logs.</p>
        {error.digest && <p style={{ fontSize: 12, color: '#777' }}>Reference: {error.digest}</p>}
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
