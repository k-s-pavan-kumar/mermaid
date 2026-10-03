'use client';

import { useCallback, useEffect, useState } from 'react';
import { PLATFORM_META, type TrackedPackage } from '../types';
import { getSdkStatus, rotateIngestKey, type SdkStatus } from '../actions';
import { toast } from '@/lib/toast';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function snippetFor(platform: TrackedPackage['platform'], endpoint: string, key: string): { title: string; code: string }[] {
  const origin = (() => { try { return new URL(endpoint).origin; } catch { return endpoint; } })();
  const cfg = `{ key: '${key}', endpoint: '${endpoint}' }`;
  if (platform === 'figma_plugin') return [
    { title: 'manifest.json — let the plugin reach your CRM', code: `"networkAccess": {\n  "allowedDomains": ["${origin}"],\n  "reasoning": "Anonymous usage counts"\n}` },
    { title: 'code.ts (plugin main thread)', code: `import { initFigma } from 'meridian-analytics';\n\nconst analytics = initFigma(${cfg}); // counts one "open" per launch\n\nanalytics.track('export_clicked');   // wherever something worth counting happens\n\n// before closing, make sure the last events are sent:\nawait analytics.flush();\nfigma.closePlugin();` },
  ];
  if (platform === 'chrome_web_store') return [
    { title: 'manifest.json', code: `"permissions": ["storage"]` },
    { title: 'popup.ts — runs each time the popup opens (= one "open")', code: `import { initChrome } from 'meridian-analytics';\n\nconst analytics = initChrome(${cfg});\n\nanalytics.track('save_clicked');` },
    { title: 'background.ts (MV3 service worker) — don’t count wake-ups as opens', code: `const analytics = initChrome({ ...${cfg}, autoOpen: false });\n\nchrome.runtime.onMessage.addListener((m) => { if (m.type === 'used') analytics.track('feature_used'); });` },
  ];
  if (platform === 'snapchat_lens') return [
    { title: 'The contract (any runtime that can POST HTTPS)', code: `POST ${endpoint}\nContent-Type: text/plain\n\n{"key":"${key}","events":[{"event":"open","anon_id":"<random 8-64 chars>"}]}` },
  ];
  return [{ title: 'Web app', code: `import { init } from 'meridian-analytics';\n\nconst analytics = init(${cfg});\n\nanalytics.track('signup_completed');` }];
}

export function SdkSetupModal({ pkg, onClose }: { pkg: TrackedPackage; onClose: () => void }) {
  const [status, setStatus] = useState<SdkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const meta = PLATFORM_META[pkg.platform];
  const endpoint = typeof window === 'undefined' ? '' : `${window.location.origin}/api/ingest`;
  const isLocal = typeof window !== 'undefined' && /^(localhost|127\.|10\.|192\.168\.)/.test(window.location.hostname);

  const refresh = useCallback(async (createKey = false) => {
    try { setStatus(await getSdkStatus(pkg.id, createKey)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load SDK status'); }
  }, [pkg.id]);

  useEffect(() => {
    void refresh(true);                       // creates the key the first time
    const t = window.setInterval(() => void refresh(), 4000); // watch events arrive live
    return () => window.clearInterval(t);
  }, [refresh]);

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`, 'success'); }
    catch { toast('Couldn’t access the clipboard', 'error', 'Select the text and copy it manually.'); }
  }

  async function rotate() {
    if (!window.confirm('Generate a new key? The current one stops working immediately — shipped builds will need the new key.')) return;
    setRotating(true);
    try {
      const r = await rotateIngestKey(pkg.id);
      toast(r.message, r.ok ? 'success' : 'error', r.detail);
      await refresh();
    } catch (e) { toast('Couldn’t rotate the key', 'error', e instanceof Error ? e.message : undefined); }
    finally { setRotating(false); }
  }

  const s = status?.summary;
  const receiving = !!s && s.events > 0;

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head"><h2>SDK setup — {pkg.name}</h2><button type="button" className="modal-close" onClick={onClose}>✕</button></div>

        {pkg.platform === 'snapchat_lens' && (
          <div className="rs-note" style={{ marginTop: 0, marginBottom: 12 }}>
            ⚠ Lenses published to the Snapchat app can’t make network calls — only Spectacles and Camera Kit lenses can. For a regular Lens, use the numbers from
            Snap’s Lens Insights (My Lenses) and enter them with <b>Edit</b>. This key is for Camera Kit / Spectacles lenses.
          </div>
        )}
        {isLocal && (
          <div className="rs-note" style={{ marginTop: 0, marginBottom: 12 }}>
            ⚠ You’re on {window.location.hostname}. A plugin or extension on someone else’s machine can’t reach this address — it works for your own testing only until the CRM is deployed.
          </div>
        )}

        {error && <div className="rs-note" style={{ marginTop: 0, marginBottom: 12 }}>⚠ {error}</div>}

        <div className={`sdk-status ${receiving ? 'live' : ''}`} role="status">
          {!status ? (<><span className="spin" aria-hidden="true" /> Loading…</>)
            : !status.key ? 'No key yet.'
            : receiving ? (
              <div>
                <div><b>✓ Receiving events</b> · last event {ago(status.last_event_at)}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {s!.active_users} active users · {s!.opens} {meta.opensLabel.toLowerCase()} · {s!.events} events (30 days)
                  {s!.return_rate !== null && ` · ${s!.return_rate}% came back`}
                </div>
                {s!.top_events.length > 0 && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Top: {s!.top_events.map((t) => `${t.event} ${t.n}`).join(' · ')}</div>}
              </div>
            ) : (<><span className="spin" aria-hidden="true" /> <span>Waiting for the first event… launch your {meta.label.toLowerCase()} once with the snippet below. This panel updates by itself.</span></>)}
        </div>

        {status?.key && (
          <>
            <label className="field-label" style={{ marginTop: 14 }}>Ingest key <span className="text-muted">(public &amp; write-only — safe to ship in your bundle)</span></label>
            <div className="sdk-row">
              <code className="rs-code" style={{ flex: 1 }}>{status.key}</code>
              <button type="button" className="btn-ghost" onClick={() => void copy(status.key!, 'Key')}>Copy</button>
              <button type="button" className={`btn-ghost is-async${rotating ? ' is-pending' : ''}`} disabled={rotating} onClick={() => void rotate()}>
                {rotating && <span className="spin" aria-hidden="true" />}<span>{rotating ? 'Rotating…' : 'Rotate'}</span>
              </button>
            </div>
            <label className="field-label" style={{ marginTop: 10 }}>Endpoint</label>
            <div className="sdk-row"><code className="rs-code" style={{ flex: 1 }}>{endpoint}</code><button type="button" className="btn-ghost" onClick={() => void copy(endpoint, 'Endpoint')}>Copy</button></div>

            {snippetFor(pkg.platform, endpoint, status.key).map((sn) => (
              <div key={sn.title} style={{ marginTop: 12 }}>
                <div className="sdk-snip-head"><span className="field-label" style={{ margin: 0 }}>{sn.title}</span><button type="button" className="mini-btn ghost" onClick={() => void copy(sn.code, 'Snippet')}>Copy</button></div>
                <pre className="rs-code block">{sn.code}</pre>
              </div>
            ))}
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
              Install: copy <code>sdk/dist/index.js</code> into your project (or publish the <code>sdk</code> folder to npm). Only an event name and a random anonymous id are sent — no personal data, no properties.
              Mention anonymous usage counts in your listing’s privacy section.
            </p>
          </>
        )}
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
