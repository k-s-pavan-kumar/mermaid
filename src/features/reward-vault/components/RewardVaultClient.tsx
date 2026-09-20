'use client';

import { useEffect, useMemo, useState } from 'react';
import type { NeedWithSource } from '../queries';
import { addNeed, relinkNeed, markPurchased, acknowledgeNotification, deleteNeed } from '../actions';
import { NEED_ICON_CHOICES, NEED_CATEGORY_CHOICES } from '../types';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
function pretty(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function hoursLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));
}
function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'In progress', cls: 'progress' },
  cooling_off: { label: 'Cooling off', cls: 'cooling' },
  ready: { label: 'Ready to buy', cls: 'ready' },
  purchased: { label: 'Purchased', cls: 'purchased' },
  released: { label: 'Needs new project', cls: 'released' },
  expired: { label: 'Expired', cls: 'expired' },
};

export function RewardVaultClient({
  needs, currency, options, auditLog,
}: {
  needs: NeedWithSource[];
  currency: string;
  options: {
    projects: { id: string; name: string; invoiceAmount: number; occupiedBy: string | null }[];
    courses: { id: string; name: string; occupiedBy: string | null }[];
  };
  auditLog: { id: string; changed_at: string; project_name: string; field_changed: string; from_value: string; to_value: string; note: string | null }[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [relinkTarget, setRelinkTarget] = useState<NeedWithSource | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toastNeed, setToastNeed] = useState<NeedWithSource | null>(null);

  // Exactly-once toast: the server already set notify_pending during
  // reconciliation before this page rendered, so the first Need carrying
  // one (there should be at most one at a time in normal use) is shown
  // immediately, then acknowledged so a reload doesn't show it again.
  useEffect(() => {
    const pending = needs.find((n) => n.notify_pending);
    if (pending) {
      setToastNeed(pending);
      void acknowledgeNotification(pending.id);
      const t = setTimeout(() => setToastNeed(null), 5600);
      return () => clearTimeout(t);
    }
  }, [needs]);

  const stats = useMemo(() => ({
    total: needs.filter((n) => n.status !== 'purchased').reduce((s, n) => s + n.price, 0),
    purchased: needs.filter((n) => n.status === 'purchased').length,
    coolingOff: needs.filter((n) => n.status === 'cooling_off').length,
  }), [needs]);

  return (
    <>
      <div className="rv-header-stats">
        <div><div className="rv-num">{fmt(stats.total, currency)}</div><div className="rv-lbl">total value tracked</div></div>
        <div><div className="rv-num">{stats.purchased}</div><div className="rv-lbl">purchased</div></div>
        <div><div className="rv-num">{stats.coolingOff}</div><div className="rv-lbl">cooling off</div></div>
      </div>

      <div className="rv-rules">
        <div className="rv-rule"><span className="n">1</span><span>Unlocking needs <strong>Completed + Invoice paid</strong> (or a completed course) together, then starts a cooldown before it&apos;s actually purchasable.</span></div>
        <div className="rv-rule"><span className="n">2</span><span>A need&apos;s price can&apos;t exceed the configured <strong>spend cap</strong> of its linked project&apos;s invoice, or the flat course cap.</span></div>
        <div className="rv-rule"><span className="n">3</span><span>Only <strong>one active need per source</strong> — finishing one project or course unlocks one reward, never a cascade.</span></div>
        <div className="rv-rule"><span className="n">4</span><span>Ready-to-buy items <strong>expire</strong> if unpurchased, and re-lock. Dropped projects release their need the same way.</span></div>
      </div>

      {needs.length === 0 ? (
        <div className="rv-board">
          <div className="empty">
            <img src="/mascot/idea.png" alt="" width={96} height={96} />
            <div className="big">Nothing in the vault yet</div>
            Link a finished project or course to your first want.
            <div><button type="button" className="btn" onClick={() => setAddOpen(true)}>+ Add a need</button></div>
          </div>
        </div>
      ) : (
      <div className="rv-board">
        <div className="rv-row head">
          <div>Need</div><div>Price</div><div>Linked source</div><div>Progress</div><div>Status</div><div>Earned / Purchased</div>
        </div>

        {needs.map((n) => {
          const pill = STATUS_PILL[n.status];
          return (
            <div key={n.id} className={`rv-row item ${n.status}`}>
              <div className="rv-need">
                <div className={`rv-icon ${n.status === 'purchased' ? 'done' : n.status === 'released' || n.status === 'expired' ? 'muted' : ''}`}>{n.emoji_icon}</div>
                <div>
                  <div className={`rv-name ${n.status === 'purchased' ? 'done' : ''}`}>{n.name}</div>
                  <div className="rv-cat">Wants · {n.category}</div>
                </div>
              </div>
              <div className="rv-price">{fmt(n.price, currency)}</div>
              <div className="rv-proj-cell">
                <div className={`rv-proj-name ${n.status === 'released' || n.status === 'expired' ? 'struck' : ''}`}>
                  {n.source?.name ?? '—'}
                </div>
                <div className="rv-chips">
                  {(n.source?.chips ?? []).map((c, i) => <span key={i} className={`rv-chip ${c.tone}`}>{c.label}</span>)}
                </div>
              </div>
              <div className="rv-progress-wrap">
                <div className="rv-progress-track"><div className={`rv-progress-fill ${n.status}`} style={{ width: `${n.progress_pct}%` }} /></div>
                <div className="rv-progress-label">
                  {n.status === 'released' ? `Frozen at ${n.progress_pct}% — doesn't count toward next unlock`
                    : n.status === 'expired' ? `Sat unpurchased for ${Math.round((Date.parse(n.expires_at ?? '') - Date.parse(n.cooldown_ends_at ?? n.unlocked_at ?? '')) / 86_400_000)} days`
                    : n.status === 'cooling_off' ? 'Cooldown in progress'
                    : n.status === 'ready' ? 'Cooldown ended'
                    : n.status === 'purchased' ? 'Cooldown served · bought'
                    : n.source?.progressLabel ?? ''}
                </div>
              </div>
              <div className="rv-status-col">
                <span className={`rv-pill ${pill?.cls}`}>
                  {n.status === 'cooling_off' ? `Cooling off · ${hoursLeft(n.cooldown_ends_at)}h left` : pill?.label}
                </span>
                {n.status === 'ready' && <button type="button" className="mini-btn" onClick={() => void markPurchased(n.id)}>Mark purchased</button>}
                {(n.status === 'released' || n.status === 'expired') && (
                  <button type="button" className="mini-btn" onClick={() => setRelinkTarget(n)}>{n.status === 'released' ? 'Relink →' : 'Re-earn →'}</button>
                )}
                {(n.status === 'released' || n.status === 'expired' || n.status === 'purchased') && (
                  <button type="button" className="mini-btn ghost" onClick={() => void deleteNeed(n.id)}>Delete</button>
                )}
              </div>
              <div className="rv-dates">
                {n.status === 'purchased' && <>
                  <div className="r1">Earned {pretty(n.unlocked_at)}</div>
                  <div className="r2">Purchased {pretty(n.purchased_at)}</div>
                </>}
                {n.status === 'ready' && <>
                  <div className="r1">Earned {pretty(n.unlocked_at)}</div>
                  <div className="r2">Expires in {daysLeft(n.expires_at)} days</div>
                </>}
                {n.status === 'cooling_off' && <>
                  <div className="r1">Earned {pretty(n.unlocked_at)}</div>
                  <div className="r2">Purchasable in {hoursLeft(n.cooldown_ends_at)}h</div>
                </>}
                {n.status === 'expired' && <>
                  <div className="r1">Earned {pretty(n.unlocked_at)}</div>
                  <div className="r2">Expired {pretty(n.expires_at)}</div>
                </>}
                {(n.status === 'in_progress' || n.status === 'released') && <div className="dim">—</div>}
              </div>
            </div>
          );
        })}

        <div className="rv-add-row" onClick={() => setAddOpen(true)}><span className="plus">+</span>Add a need</div>
      </div>
      )}

      <div className={`rv-log-toggle ${logOpen ? 'open' : ''}`} onClick={() => setLogOpen((v) => !v)}>
        <span className="chev">▶</span> View project status log
      </div>
      {logOpen && (
        <div className="card rv-log-panel">
          {auditLog.length === 0 ? (
            <p className="text-muted text-sm" style={{ margin: 0 }}>No status changes logged yet.</p>
          ) : auditLog.map((entry) => (
            <div key={entry.id} className="rv-log-row">
              <span className="rv-log-date">{pretty(entry.changed_at)}</span>
              <span className="rv-log-text">
                <strong>{entry.project_name}</strong> {entry.field_changed === 'status' ? 'status' : 'earned'}:{' '}
                {entry.from_value} → {entry.to_value}
                {entry.note && <span className="text-muted"> — {entry.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {toastNeed && (
        <div className="rv-toast show">
          <div className="badge">{toastNeed.notify_pending === 'ready' ? '🎉' : '⏳'}</div>
          <div className="body">
            <div className="title">{toastNeed.notify_pending === 'ready' ? 'Ready to buy' : 'Cooldown started'}</div>
            <div className="desc">
              {toastNeed.name} — {toastNeed.source?.name} was marked {toastNeed.notify_pending === 'ready' ? 'ready' : 'Completed and Paid'}.
              {toastNeed.notify_pending !== 'ready' && ' Purchasable soon.'}
            </div>
          </div>
          <button type="button" className="close" onClick={() => setToastNeed(null)}>✕</button>
        </div>
      )}

      {addOpen && <NeedModal title="Add a need" options={options} onClose={() => setAddOpen(false)}
        submit={async (fd) => addNeed(fd)} />}
      {relinkTarget && (
        <NeedModal
          title={`Relink "${relinkTarget.name}"`}
          options={options}
          onClose={() => setRelinkTarget(null)}
          submit={async (fd) => relinkNeed(relinkTarget.id, fd)}
        />
      )}
    </>
  );
}

function NeedModal({
  title, options, onClose, submit,
}: {
  title: string;
  options: { projects: { id: string; name: string; invoiceAmount: number; occupiedBy: string | null }[]; courses: { id: string; name: string; occupiedBy: string | null }[] };
  onClose: () => void;
  submit: (fd: FormData) => Promise<{ error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'project' | 'course'>('project');
  const [icon, setIcon] = useState<string>(NEED_ICON_CHOICES[0] ?? '🎁');
  const isAdd = title === 'Add a need';

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head"><h2>{title}</h2><button type="button" className="modal-close" onClick={onClose}>✕</button></div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          Only active, unoccupied projects or courses show up below.
        </p>
        <form
          action={async (fd) => {
            fd.set('source_type', sourceType);
            fd.set('emoji_icon', icon);
            const result = await submit(fd);
            if (result.error) setError(result.error);
            else onClose();
          }}
        >
          {isAdd && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="name">Need</label>
                <input id="name" name="name" required placeholder="e.g. Standing desk" style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Icon</label>
                <div className="rv-icon-pick">
                  {NEED_ICON_CHOICES.map((e) => (
                    <div key={e} className={`rv-icon-opt ${icon === e ? 'selected' : ''}`} onClick={() => setIcon(e)}>{e}</div>
                  ))}
                </div>
              </div>
              <div className="grid-2-eq" style={{ marginBottom: 12 }}>
                <div>
                  <label className="field-label" htmlFor="category">Category</label>
                  <select id="category" name="category" style={{ width: '100%' }}>
                    {NEED_CATEGORY_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="price">Price</label>
                  <input id="price" name="price" type="number" min={1} step="1" required placeholder="10000" style={{ width: '100%' }} />
                </div>
              </div>
            </>
          )}

          <div style={{ marginBottom: 4 }}>
            <label className="field-label">Link to</label>
            <div className="df-toggle" style={{ marginBottom: 10 }}>
              <button type="button" className={sourceType === 'project' ? 'active' : ''} onClick={() => setSourceType('project')}>Project</button>
              <button type="button" className={sourceType === 'course' ? 'active' : ''} onClick={() => setSourceType('course')}>Course</button>
            </div>
            <select name="source_id" required style={{ width: '100%' }}>
              <option value="">Select an active {sourceType}…</option>
              {sourceType === 'project'
                ? options.projects.map((p) => (
                    <option key={p.id} value={p.id} disabled={!!p.occupiedBy}>
                      {p.name}{p.occupiedBy ? ' (already has an active need)' : ` (invoice ${p.invoiceAmount.toLocaleString('en-IN')})`}
                    </option>
                  ))
                : options.courses.map((c) => (
                    <option key={c.id} value={c.id} disabled={!!c.occupiedBy}>
                      {c.name}{c.occupiedBy ? ' (already has an active need)' : ''}
                    </option>
                  ))}
            </select>
            <p className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
              Unlocks only once this {sourceType} is completed{sourceType === 'project' ? ' and paid' : ''}, then a cooldown before it&apos;s purchasable.
            </p>
          </div>

          {error && <p style={{ color: 'var(--crimson)', fontSize: 12, marginTop: 8 }}>{error}</p>}

          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">{isAdd ? 'Add need' : 'Relink'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
