'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Msg { role: 'user' | 'assistant'; content: string; effects?: { label: string; href?: string }[] }

const SUGGESTIONS = [
  'Summarise my day',
  'Add a task: review the TPN report',
  'Draft an invoice for 8 hours of Figma teaching at ₹1500/hr',
  "What's still unpaid?",
];

/**
 * Meri — the assistant dock.
 *
 * Kept as a side panel rather than a page so it can be opened over whatever
 * you're already looking at; after a tool call it refreshes the current
 * route, so a task created from here appears in the list behind it without
 * a manual reload.
 */
export function AssistantPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'The assistant is unavailable.');
      } else {
        setMessages((cur) => [...cur, { role: 'assistant', content: data.reply, effects: data.effects }]);
        if (data.effects?.length) router.refresh();
      }
    } catch {
      setError('Could not reach the assistant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`meri-fab${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Ask Meri (⌘J)"
        aria-label="Ask Meri"
      >
        <img src="/mascot/meri-sm.png" alt="" width={40} height={40} />
      </button>

      {open && (
        <aside className="meri-panel" aria-label="Assistant">
          <header className="meri-head">
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <img src="/mascot/idea.png" alt="" width={30} height={30} />
              <span>
                <strong style={{ fontFamily: "'Fraunces',serif" }}>Meri</strong>
                <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: -2 }}>
                  can read your day and create things
                </span>
              </span>
            </span>
            <button type="button" className="btn-link" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>

          <div className="meri-body">
            {messages.length === 0 && (
              <div className="meri-intro">
                <img src="/mascot/thinking.png" alt="" width={96} height={96} />
                <p className="text-muted text-sm">Ask for a summary, or tell me what to create.</p>
                <div className="meri-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="meri-chip" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`meri-msg ${m.role}`}>
                <div>{m.content}</div>
                {m.effects && m.effects.length > 0 && (
                  <div className="meri-effects">
                    {m.effects.map((e, j) =>
                      e.href ? (
                        <a key={j} href={e.href} className="meri-effect">✓ {e.label}</a>
                      ) : (
                        <span key={j} className="meri-effect">✓ {e.label}</span>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="meri-msg assistant busy">
                <span className="spin" aria-hidden="true" /> thinking…
              </div>
            )}
            {error && <div className="meri-error">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="meri-compose">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask Meri…  (Enter to send)"
              rows={2}
            />
            <button type="button" className="btn-inline" onClick={() => send(input)} disabled={busy || !input.trim()}>
              Send
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
