'use client';

import { useState, useTransition } from 'react';
import type { PackageWithMetrics } from '../queries';
import { PLATFORM_META, PLATFORMS, type ManualField, type Platform, type TrackedPackage, type MetricSnapshot } from '../types';
import { addTrackedPackage, deleteTrackedPackage, syncAllPackages, updateTrackedPackage, type SyncResult } from '../actions';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { SdkSetupModal } from './SdkSetupModal';
import { IconPicker, CardIconModal } from './IconPicker';
import { defaultIconFor } from '../icon';
import { toast } from '@/lib/toast';

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
  const meta = PLATFORM_META[lead.platform];
  if (meta.sdk && lead.platform !== 'saas' && rows.some((r) => (r.sdk?.events ?? 0) > 0)) {
    return [
      { num: fmtNum(sum(rows, (s) => s.users)), label: 'Active users (30d)' },
      { num: fmtNum(sum(rows, (s) => s.opens_30d)), label: `${meta.opensLabel} (30d)` },
    ];
  }
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
  if (r.latest && !r.latest.fetch_ok) return { cls: 'stale', text: '⚠ Stale — sync failed' };
  if (r.pkg.ingest_key) {
    return (r.sdk?.events ?? 0) > 0 ? { cls: 'ok', text: '📡 SDK live' } : { cls: 'stale', text: '⏳ Waiting for first event' };
  }
  if (!r.latest) return { cls: 'stale', text: meta.auto ? '⚠ Not synced yet' : '✍ Add numbers' };
  return meta.auto ? { cls: 'ok', text: '🔄 Auto-synced' } : { cls: 'manual', text: '✍ Manual' };
}

function syncToast(r: SyncResult) {
  if (r.total === 0) return toast('Nothing to sync yet', 'info', 'Add a product first.');
  const manual = r.skipped > 0 ? `${r.skipped} manual product${r.skipped > 1 ? 's' : ''} have nothing to pull.` : undefined;
  if (r.failed.length === 0) return toast(`Synced ${r.synced} product${r.synced === 1 ? '' : 's'}`, 'success', manual);
  const detail = r.failed.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join('\n') + (r.failed.length > 3 ? `\n…and ${r.failed.length - 3} more` : '');
  return toast(`${r.failed.length} of ${r.total} failed to sync`, 'error', detail);
}

/** Store numbers (hand-entered) + SDK return rate, shown under SDK-capable cards. */
function subLine(rows: PackageWithMetrics[], lead: TrackedPackage): string | null {
  const meta = PLATFORM_META[lead.platform];
  if (!meta.sdk || lead.platform === 'saas') return null;
  const bits: string[] = [];
  const rr = rows[0]?.latest?.return_rate;
  if (rr !== null && rr !== undefined && (rows[0]?.sdk?.events ?? 0) > 0) bits.push(`${rr}% came back on 2+ days`);
  const store = sum(rows, (s) => s.installs);
  if (store !== null && (rows[0]?.sdk?.events ?? 0) > 0) bits.push(`Store: ${fmtNum(store)} ${meta.installsLabel.toLowerCase()}`);
  const rating = rows[0]?.latest?.rating;
  if (rating) bits.push(`★ ${rating}${rows[0]?.latest?.review_count ? ` (${rows[0].latest.review_count})` : ''}`);
  return bits.length ? bits.join(' · ') : null;
}

function PackageForm({
  mode, pkg, onClose,
}: { mode: 'add' | 'edit'; pkg?: TrackedPackage; onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform>(pkg?.platform ?? 'npm');
  const meta = PLATFORM_META[platform];
  // New products follow the platform's default icon until you pick one yourself.
  const [icon, setIcon] = useState(pkg?.emoji_icon ?? defaultIconFor(pkg?.platform ?? 'npm'));
  const [iconPicked, setIconPicked] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const groups = Array.from(new Set(PLATFORMS.map((p) => PLATFORM_META[p].group)));

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{mode === 'add' ? 'Track a product' : `Edit ${pkg?.name}`}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form action={async (fd) => {
          try {
            const r = await (mode === 'add' ? addTrackedPackage(fd) : updateTrackedPackage(fd));
            toast(r.message, r.ok ? (r.detail && /failed/i.test(r.message) ? 'error' : 'success') : 'error', r.detail);
            if (r.ok) onClose();
          } catch (e) {
            toast('Couldn’t save', 'error', e instanceof Error ? e.message : undefined);
          }
        }}>
          {mode === 'edit' && <input type="hidden" name="id" value={pkg?.id} />}

          <input type="hidden" name="emoji_icon" value={icon} />
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'end', marginBottom: iconOpen ? 8 : 12 }}>
            <div>
              <span className="field-label" style={{ display: 'block' }}>Icon</span>
              <button type="button" className="rs-pkg-icon is-editable" aria-expanded={iconOpen} title="Choose an icon" onClick={() => setIconOpen((o) => !o)}>{icon}</button>
            </div>
            <div>
              <label className="field-label" htmlFor="name">Name</label>
              <input id="name" name="name" required defaultValue={pkg?.name} placeholder="e.g. Syntheui React Icons" style={{ width: '100%' }} />
            </div>
          </div>
          {iconOpen && (
            <div style={{ marginBottom: 12 }}>
              <IconPicker value={icon} onChange={(i) => { setIcon(i); setIconPicked(true); }} defaultIcon={defaultIconFor(platform)} />
            </div>
          )}

          <div className="grid-2-eq" style={{ marginBottom: 12 }}>
            <div>
              <label className="field-label" htmlFor="platform">Platform</label>
              {mode === 'add' ? (
                <select id="platform" name="platform" value={platform} onChange={(e) => { const next = e.target.value as Platform; setPlatform(next); if (!iconPicked) setIcon(defaultIconFor(next)); }} style={{ width: '100%' }}>
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

          {meta.sdk && mode === 'add' && (
            <p className="text-muted text-sm" style={{ margin: '0 0 12px' }}>
              📡 You’ll get an SDK key for first-party stats ({meta.opensLabel.toLowerCase()}, active users, return rate) after adding — open <b>SDK setup</b> on the card.
            </p>
          )}
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
            <div>
              <label className="field-label" htmlFor="family">Family (optional)</label>
              <input id="family" name="family" placeholder="e.g. Syntheui" style={{ width: '100%' }} />
            </div>
          )}

          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <SubmitButton className="btn" pendingLabel={mode === 'add' ? 'Adding…' : 'Saving…'}>{mode === 'add' ? (meta.auto ? 'Add & sync' : 'Add') : 'Save & sync'}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReleaseStatsClient({ groups }: { groups: { family: string; rows: PackageWithMetrics[] }[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TrackedPackage | null>(null);
  const [sdkFor, setSdkFor] = useState<TrackedPackage | null>(null);
  const [iconFor, setIconFor] = useState<{ name: string; ids: string[]; current: string; platform: Platform } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="rs-sync-bar">
        <span className="text-muted text-sm">
          {groups.length === 0 ? 'Nothing tracked yet.' : `Last synced ${timeAgo(groups[0]?.rows[0]?.latest?.captured_at ?? null)}`}
        </span>
        <button type="button" className={`btn-ghost is-async${pending ? ' is-pending' : ''}`} disabled={pending} aria-busy={pending}
          onClick={() => startTransition(async () => {
            try { syncToast(await syncAllPackages()); }
            catch (e) { toast('Sync failed', 'error', e instanceof Error ? e.message : undefined); }
          })}>
          {pending && <span className="spin" aria-hidden="true" />}
          <span>{pending ? 'Syncing…' : '🔄 Sync now'}</span>
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
                  <button type="button" className="rs-pkg-icon is-editable" title="Change icon" aria-label={`Change icon for ${g.family}`}
                    onClick={() => setIconFor({ name: g.family, ids: g.rows.map((r) => r.pkg.id), current: lead.pkg.emoji_icon, platform: lead.pkg.platform })}>
                    {lead.pkg.emoji_icon}
                  </button>
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
                    {!multi && PLATFORM_META[lead.pkg.platform].sdk && <button type="button" className="mini-btn" onClick={() => setSdkFor(lead.pkg)}>SDK setup</button>}
                    {!multi && <button type="button" className="mini-btn ghost" onClick={() => setEditing(lead.pkg)}>Edit</button>}
                    <ActionButton className="mini-btn ghost" pendingLabel="Removing…" confirm={`Remove ${g.family}? Its numbers and history will be deleted.`}
                      successMessage={`Removed ${g.family}`} action={() => deleteTrackedPackage(lead.pkg.id)}>Remove</ActionButton>
                  </div>
                </div>
              </div>

              {subLine(g.rows, lead.pkg) && <div className="rs-sub-line">{subLine(g.rows, lead.pkg)}</div>}
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
      {sdkFor && <SdkSetupModal key={sdkFor.id} pkg={sdkFor} onClose={() => setSdkFor(null)} />}
      {iconFor && (
        <CardIconModal key={iconFor.ids.join(',')} name={iconFor.name} ids={iconFor.ids} current={iconFor.current}
          defaultIcon={defaultIconFor(iconFor.platform)} onClose={() => setIconFor(null)} />
      )}
    </>
  );
}
