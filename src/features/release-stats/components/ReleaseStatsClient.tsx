'use client';

import { useState, useTransition } from 'react';
import type { PackageWithMetrics } from '../queries';
import { PLATFORM_META, PLATFORMS, type ManualField, type Platform, type TrackedPackage, type MetricSnapshot } from '../types';
import { addTrackedPackage, deleteTrackedPackage, syncAllPackages, updateTrackedPackage } from '../actions';

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

const MANUAL_FIELD_LABEL: Record<ManualField, string> = {
  installs: 'Users / installs / plays', rating: 'Rating (0–5)', review_count: 'Reviews',
  users: 'Active users', mrr: 'MRR',
};

/** Sum a field across a family's rows; null when none of them has a value. */
function sum(rows: PackageWithMetrics[], pick: (s: MetricSnapshot) => number | null): number | null {
  let seen = false, total = 0;
  for (const r of rows) {
    const v = r.latest ? pick(r.latest) : null;
    if (v !== null && v !== undefined) { seen = true; total += v; }
  }
  return seen ? total : null;
}

type Headline = { num: string; label: string };
function headlineMetrics(rows: PackageWithMetrics[], lead: TrackedPackage): [Headline, Headline] {
  if (lead.platform === 'saas') {
    return [
      { num: fmtNum(sum(rows, (s) => s.users)), label: 'Active users' },
      { num: fmtNum(sum(rows, (s) => s.mrr)), label: 'MRR' },
    ];
  }
  return [
    { num: fmtNum(sum(rows, (s) => s.stars)), label: 'GitHub stars' },
    { num: fmtNum(sum(rows, (s) => (s.downloads_30d !== null || s.installs !== null ? (s.downloads_30d ?? 0) + (s.installs ?? 0) : null))), label: PLATFORM_META[lead.platform].installsLabel },
  ];
}

function statusTag(r: PackageWithMetrics): { cls: string; text: string } {
  const meta = PLATFORM_META[r.pkg.platform];
  if (!r.latest) return { cls: 'stale', text: meta.auto ? '⚠ Not synced yet' : '✍ Add numbers' };
  if (!r.latest.fetch_ok) return { cls: 'stale', text: '⚠ Stale — sync failed' };
  return meta.auto ? { cls: 'ok', text: '🔄 Auto-synced' } : { cls: 'manual', text: '✍ Manual' };
}

function PackageForm({
  mode, pkg, onClose,
}: { mode: 'add' | 'edit'; pkg?: TrackedPackage; onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>(pkg?.platform ?? 'npm');
  const meta = PLATFORM_META[platform];
  const groups = Array.from(new Set(PLATFORMS.map((p) => PLATFORM_META[p].group)));

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{mode === 'add' ? 'Track a product' : `Edit ${pkg?.name}`}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form action={async (fd) => { await (mode === 'add' ? addTrackedPackage(fd) : updateTrackedPackage(fd)); onClose(); }}>
          {mode === 'edit' && <input type="hidden" name="id" value={pkg?.id} />}

          <div style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="name">Name</label>
            <input id="name" name="name" required defaultValue={pkg?.name} placeholder="e.g. Syntheui React Icons" style={{ width: '100%' }} />
          </div>

          <div className="grid-2-eq" style={{ marginBottom: 12 }}>
            <div>
              <label className="field-label" htmlFor="platform">Platform</label>
              {mode === 'add' ? (
                <select id="platform" name="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} style={{ width: '100%' }}>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {PLATFORMS.filter((p) => PLATFORM_META[p].group === g).map((p) => (
                        <option key={p} value={p}>{PLATFORM_META[p].label}{PLATFORM_META[p].auto ? '' : ' (manual)'}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <input value={meta.label} disabled style={{ width: '100%' }} />
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="platform_identifier">{meta.identifierLabel}</label>
              <input id="platform_identifier" name="platform_identifier" required={meta.auto} defaultValue={pkg?.platform_identifier}
                placeholder={meta.identifierPlaceholder} style={{ width: '100%' }} />
            </div>
          </div>

          {!meta.auto && (
            <p className="text-muted text-sm" style={{ margin: '0 0 12px' }}>
              {platform === 'saas'
                ? 'SaaS products have no public stats API — enter users and MRR yourself and update them whenever they change.'
                : `${meta.label} has no public stats API, so these numbers are entered by hand. Leave a field blank to keep its last value.`}
            </p>
          )}

          {meta.manualFields.length > 0 && (
            <div className="grid-2-eq" style={{ marginBottom: 12 }}>
              {meta.manualFields.map((f) => (
                <div key={f}>
                  <label className="field-label" htmlFor={f}>{f === 'installs' ? meta.installsLabel : MANUAL_FIELD_LABEL[f]}</label>
                  <input id={f} name={f} inputMode="decimal" placeholder="—" style={{ width: '100%' }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="github_repo">GitHub repo for stars (optional)</label>
            <input id="github_repo" name="github_repo" defaultValue={pkg?.github_repo ?? ''} placeholder="owner/repo" style={{ width: '100%' }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="description">Description</label>
            <input id="description" name="description" defaultValue={pkg?.description} placeholder="One line" style={{ width: '100%' }} />
          </div>

          {mode === 'add' && (
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
          )}

          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">{mode === 'add' ? (meta.auto ? 'Add & sync' : 'Add') : 'Save & sync'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReleaseStatsClient({ groups }: { groups: { family: string; rows: PackageWithMetrics[] }[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TrackedPackage | null>(null);
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

      {groups.length === 0 ? (
        <div className="card">
          <div className="empty">
            <img src="/mascot/star.png" alt="" width={96} height={96} />
            <div className="big">Nothing tracked yet</div>
            Add a package, extension, plugin, lens or SaaS product.
            <div><button type="button" className="btn" onClick={() => setAddOpen(true)}>+ Track a product</button></div>
          </div>
        </div>
      ) : (
      <div className="rs-board">
        {groups.map((g) => {
          const lead = g.rows[0];
          if (!lead) return null;
          const multi = g.rows.length > 1;
          const [mA, mB] = headlineMetrics(g.rows, lead.pkg);
          const tag = statusTag(lead);
          const platformLabel = Array.from(new Set(g.rows.map((r) => PLATFORM_META[r.pkg.platform].label))).join(' · ');
          const issue = g.rows.map((r) => r.latest?.fetch_error).find(Boolean);
          return (
            <div key={g.family} className="rs-pkg">
              <div className="rs-pkg-top">
                <div className="rs-pkg-main">
                  <div className="rs-pkg-icon">{lead.pkg.emoji_icon}</div>
                  <div>
                    <div className="rs-pkg-name">{g.family}</div>
                    <div className="rs-pkg-sub">{lead.pkg.description}</div>
                    <span className="rs-platform">{platformLabel}{multi ? ` · ${g.rows.length} packages` : ''}</span>
                  </div>
                </div>
                <div className="rs-metric"><div className="num">{mA.num}</div><div className="label">{mA.label}</div></div>
                <div className="rs-metric"><div className="num">{mB.num}</div><div className="label">{mB.label}</div></div>
                <div className="rs-spark">
                  {lead.history.map((h, i) => {
                    const val = (s: MetricSnapshot) => lead.pkg.platform === 'saas' ? (s.mrr ?? s.users ?? 0) : (s.stars ?? 0) + (s.downloads_30d ?? 0) + (s.installs ?? 0);
                    const max = Math.max(1, ...lead.history.map(val));
                    return <div key={i} className="rs-spark-bar" style={{ height: `${Math.max(10, (val(h) / max) * 100)}%` }} />;
                  })}
                </div>
                <div className="rs-last-sync">
                  <span className={`rs-tag ${tag.cls}`}>{tag.text}</span>
                  <div>{timeAgo(lead.latest?.captured_at ?? null)}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!multi && <button type="button" className="mini-btn ghost" onClick={() => setEditing(lead.pkg)}>Edit</button>}
                    <button type="button" className="mini-btn ghost" onClick={() => void deleteTrackedPackage(lead.pkg.id)}>Remove</button>
                  </div>
                </div>
              </div>

              {issue && <div className="rs-note">⚠ {issue}</div>}

              {multi && (
                <div className="rs-sub-pkgs">
                  {g.rows.map((r) => (
                    <div key={r.pkg.id} className="rs-sub-pkg">
                      <span className="name">{r.pkg.name}</span>
                      <div className="figs">
                        <span><strong>{fmtNum((r.latest?.downloads_30d ?? 0) + (r.latest?.installs ?? 0))}</strong> dl/30d</span>
                        <span><strong>{fmtNum(r.latest?.stars ?? null)}</strong> ★</span>
                        <button type="button" className="mini-btn ghost" onClick={() => setEditing(r.pkg)}>Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="bb-add-card" onClick={() => setAddOpen(true)}>+ Track a product</div>
      </div>
      )}

      {addOpen && <PackageForm mode="add" onClose={() => setAddOpen(false)} />}
      {editing && <PackageForm key={editing.id} mode="edit" pkg={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
