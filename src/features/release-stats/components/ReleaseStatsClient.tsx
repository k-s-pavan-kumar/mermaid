'use client';

import { useState, useTransition } from 'react';
import type { PackageWithMetrics } from '../queries';
import { PLATFORM_LABEL, type Platform } from '../types';
import { addTrackedPackage, deleteTrackedPackage, syncAllPackages } from '../actions';

function fmtNum(n: number | null): string {
  if (n === null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ReleaseStatsClient({ groups }: { groups: { family: string; rows: PackageWithMetrics[] }[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="rs-sync-bar">
        <span className="text-muted text-sm">
          {groups.length === 0 ? 'Nothing tracked yet.' : `Last synced ${timeAgo(groups[0]?.rows[0]?.latest?.captured_at ?? null)}`}
        </span>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => startTransition(() => { void syncAllPackages(); })}>
          {pending ? 'Syncing…' : '🔄 Sync now'}
        </button>
      </div>

      <div className="rs-board">
        {groups.map((g) => {
          const lead = g.rows[0];
          const subRows = g.rows.length > 1 ? g.rows : [];
          const totalStars = g.rows.reduce((n, r) => n + (r.latest?.stars ?? 0), 0);
          const totalDl = g.rows.reduce((n, r) => n + (r.latest?.downloads_30d ?? 0) + (r.latest?.installs ?? 0), 0);
          if (!lead) return null;
          return (
            <div key={g.family} className="rs-pkg">
              <div className="rs-pkg-top">
                <div className="rs-pkg-main">
                  <div className="rs-pkg-icon">{lead.pkg.emoji_icon}</div>
                  <div>
                    <div className="rs-pkg-name">{g.family}</div>
                    <div className="rs-pkg-sub">{lead.pkg.description}</div>
                    <span className="rs-platform">{PLATFORM_LABEL[lead.pkg.platform]}{g.rows.length > 1 ? ` · ${g.rows.length} packages` : ''}</span>
                  </div>
                </div>
                <div className="rs-metric">
                  <div className="num">{fmtNum(totalStars)}</div>
                  <div className="label">GitHub stars</div>
                </div>
                <div className="rs-metric">
                  <div className="num">{fmtNum(totalDl)}</div>
                  <div className="label">Downloads / installs (30d)</div>
                </div>
                <div className="rs-spark">
                  {lead.history.map((h, i) => (
                    <div key={i} className="rs-spark-bar" style={{ height: `${Math.max(10, ((h.stars ?? 0) / Math.max(1, ...lead.history.map((x) => x.stars ?? 0))) * 100)}%` }} />
                  ))}
                </div>
                <div className="rs-last-sync">
                  <span className={`rs-tag ${lead.latest?.fetch_ok ? 'ok' : 'stale'}`}>
                    {lead.latest?.fetch_ok ? '🔄 Auto-synced' : '⚠ Stale — sync unavailable'}
                  </span>
                  <div>{timeAgo(lead.latest?.captured_at ?? null)}</div>
                  <button type="button" className="mini-btn ghost" onClick={() => void deleteTrackedPackage(lead.pkg.id)}>Remove</button>
                </div>
              </div>
              {subRows.length > 0 && (
                <div className="rs-sub-pkgs">
                  {subRows.map((r) => (
                    <div key={r.pkg.id} className="rs-sub-pkg">
                      <span className="name">{r.pkg.name}</span>
                      <div className="figs">
                        <span><strong>{fmtNum((r.latest?.downloads_30d ?? 0) + (r.latest?.installs ?? 0))}</strong> dl/30d</span>
                        <span><strong>{fmtNum(r.latest?.stars ?? null)}</strong> ★</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="bb-add-card" onClick={() => setAddOpen(true)}>+ Track a package</div>
      </div>

      {addOpen && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div className="modal">
            <div className="modal-head"><h2>Track a package</h2><button type="button" className="modal-close" onClick={() => setAddOpen(false)}>✕</button></div>
            <form action={async (fd) => { await addTrackedPackage(fd); setAddOpen(false); }}>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="name">Name</label>
                <input id="name" name="name" required placeholder="e.g. syntheui-react-icons" style={{ width: '100%' }} />
              </div>
              <div className="grid-2-eq" style={{ marginBottom: 12 }}>
                <div>
                  <label className="field-label" htmlFor="platform">Platform</label>
                  <select id="platform" name="platform" style={{ width: '100%' }}>
                    {(['npm', 'pypi', 'github', 'chrome_web_store'] as Platform[]).map((p) => (
                      <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="platform_identifier">Identifier</label>
                  <input id="platform_identifier" name="platform_identifier" required placeholder="npm name / owner/repo" style={{ width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="description">Description</label>
                <input id="description" name="description" placeholder="One line" style={{ width: '100%' }} />
              </div>
              <div className="grid-2-eq">
                <div>
                  <label className="field-label" htmlFor="family">Family (optional)</label>
                  <input id="family" name="family" placeholder="e.g. Syntheui" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="emoji_icon">Icon</label>
                  <input id="emoji_icon" name="emoji_icon" placeholder="📦" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
                <button type="submit" className="btn">Add &amp; sync</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
