'use client';

import { useState, useTransition } from 'react';
import type { ScaffoldResult, Stack } from './actions';

const STACKS: { value: Stack; label: string }[] = [
  { value: 'nextjs', label: 'Next.js + TypeScript' },
  { value: 'node-cli', label: 'Node CLI (ESM)' },
  { value: 'python', label: 'Python package' },
  { value: 'static', label: 'Static HTML' },
];

/**
 * Kick off a real folder on disk from inside the project record, so
 * "I decided to build this" and "the repo exists" are one step instead of a
 * context switch into a terminal. Shows exactly what happened — including
 * refusals — rather than failing silently.
 */
export function ScaffoldCard({
  defaultFolder,
  codeRoot,
  scaffold,
}: {
  defaultFolder: string;
  codeRoot: string;
  scaffold: (formData: FormData) => Promise<ScaffoldResult>;
}) {
  const [result, setResult] = useState<ScaffoldResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3>Scaffold on disk</h3>

      {!codeRoot ? (
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          Set a <a href="/settings">code root folder</a> in Settings first. Scaffolding can only
          ever write inside that one folder — that constraint is the safety model, so there is no
          default.
        </p>
      ) : (
        <>
          <p className="text-muted text-sm" style={{ marginTop: 0 }}>
            Creates <span className="mono">{codeRoot}/&lt;folder&gt;</span> with a runnable skeleton.
            It refuses to write into a folder that already has anything in it, and only works while
            the app is running on your own machine. With the checkbox on, a Next.js scaffold gets
            your <span className="mono">nextjs-dev-browser</span> package wired into its scripts, so
            <span className="mono"> npm run dev</span> opens the ephemeral localhost browser.
          </p>

          <form
            action={(formData) => {
              startTransition(async () => setResult(await scaffold(formData)));
            }}
            className="form-row"
            style={{ marginBottom: 0 }}
          >
            <input name="folder" defaultValue={defaultFolder} className="mono" aria-label="Folder name" />
            <select name="stack" defaultValue="nextjs" aria-label="Stack">
              {STACKS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label className="scaffold-check">
              <input type="checkbox" name="dev_browser" defaultChecked />
              <span>Wire in <span className="mono">nextjs-dev-browser</span></span>
            </label>
            <button type="submit" className={`btn-inline is-async${pending ? ' is-pending' : ''}`} disabled={pending}>
              {pending && <span className="spin" aria-hidden="true" />}
              <span>{pending ? 'Creating…' : 'Create folder'}</span>
            </button>
          </form>

          {result && (
            <p className={`scaffold-result ${result.ok ? 'ok' : 'bad'}`}>
              {result.ok ? '✓ ' : '× '}
              {result.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
