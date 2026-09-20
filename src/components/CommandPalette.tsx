'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PaletteItem {
  label: string;
  hint?: string;
  href: string;
  group: string;
}

// Global keyboard layer. Two idioms, both familiar:
//   ⌘K / Ctrl+K  → fuzzy command palette over pages + your real projects/clients
//   g then t/d/a/p/c/b/n/s/f/u/v/l/r → vim-style "go to" jumps
//   ?            → shortcut cheatsheet
// Shortcuts are suppressed while typing in an input so they never eat text.
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const pendingG = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return items.slice(0, 12);
    const needle = q.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, items]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      // Palette open/close works even while typing in the palette itself.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') { setOpen(false); setHelp(false); return; }

      if (open) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
        if (e.key === 'Enter') {
          e.preventDefault();
          const item = filtered[sel];
          if (item) { setOpen(false); setQ(''); router.push(item.href); }
        }
        return;
      }

      if (isTyping(e.target)) return;

      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); return; }

      if (pendingG.current) {
        pendingG.current = false;
        const map: Record<string, string> = {
          t: '/today', d: '/dashboard', a: '/calendar', p: '/projects', c: '/clients', b: '/billing', n: '/notes', s: '/settings',
          f: '/daily-finance', u: '/bounty-pipeline', v: '/reward-vault', l: '/learning-tracker', r: '/release-stats',
        };
        const dest = map[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); router.push(dest); }
        return;
      }
      if (e.key.toLowerCase() === 'g') { pendingG.current = true; setTimeout(() => { pendingG.current = false; }, 1200); }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, router]);

  return (
    <>
      {open && (
        <div className="palette-backdrop" onClick={() => setOpen(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="Jump to a page, project, or client…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="palette-list">
              {filtered.length === 0 && <div className="palette-empty">No matches.</div>}
              {filtered.map((item, i) => (
                <button
                  key={item.href + item.label}
                  className={`palette-item${i === sel ? ' sel' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => { setOpen(false); setQ(''); router.push(item.href); }}
                >
                  <span>{item.label}</span>
                  <span className="palette-group">{item.hint ?? item.group}</span>
                </button>
              ))}
            </div>
            <div className="palette-foot">↑↓ navigate · ↵ open · esc close</div>
          </div>
        </div>
      )}

      {help && (
        <div className="palette-backdrop" onClick={() => setHelp(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()} style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Keyboard shortcuts</h3>
            {[
              ['⌘K / Ctrl+K', 'Command palette'],
              ['g then t', 'Go to Today'],
              ['g then d', 'Go to Dashboard'],
              ['g then p', 'Go to Projects'],
              ['g then c', 'Go to Clients'],
              ['g then a', 'Go to Calendar'],
              ['g then b', 'Go to Billing'],
              ['g then n', 'Go to Notes'],
              ['g then s', 'Go to Settings'],
              ['g then f', 'Go to Daily Finance'],
              ['g then u', 'Go to Bug Bounty Pipeline'],
              ['g then v', 'Go to Reward Vault'],
              ['g then l', 'Go to Learning Tracker'],
              ['g then r', 'Go to Release Stats'],
              ['⌘J / Ctrl+J', 'Ask Meri'],
              ['?', 'This cheatsheet'],
              ['esc', 'Close'],
            ].map(([k, v]) => (
              <div key={k} className="list-row" style={{ padding: '7px 0' }}>
                <span className="text-sm">{v}</span>
                <kbd className="kbd">{k}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
