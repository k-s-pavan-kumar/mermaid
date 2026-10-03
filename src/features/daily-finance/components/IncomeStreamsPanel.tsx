'use client';

import { useState } from 'react';
import { saveStream, deleteStream, createStreamsFromIncome } from '../actions';
import { STREAM_COLORS, UNASSIGNED_COLOR, type IncomeStream, type PaceStatus, type StreamProgress, type StreamsOverview } from '../streams';
import { SubmitButton } from '@/components/SubmitButton';
import { ActionButton } from '@/components/ActionButton';
import { toast } from '@/lib/toast';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n: number, ccy: string) {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
/** Compact for tight spaces: ₹1.2L / ₹45k (Indian grouping). */
function short(n: number, ccy: string) {
  const p = ccy === 'INR' ? '₹' : ccy + ' ';
  const a = Math.abs(n);
  if (ccy === 'INR' && a >= 10_000_000) return `${p}${(n / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (ccy === 'INR' && a >= 100_000) return `${p}${(n / 100_000).toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}L`;
  if (a >= 1000) return `${p}${(n / 1000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${p}${Math.round(n)}`;
}

const STATUS: Record<PaceStatus, { label: string; cls: string }> = {
  no_target: { label: 'No target set', cls: 'none' },
  achieved: { label: '🎯 Target reached', cls: 'good' },
  ahead: { label: 'Ahead of pace', cls: 'good' },
  slightly_behind: { label: 'Slightly behind', cls: 'warn' },
  behind: { label: 'Behind pace', cls: 'bad' },
  missed: { label: 'Missed', cls: 'bad' },
  upcoming: { label: 'Not started', cls: 'none' },
};

// ───────────────────────── donut ─────────────────────────

function Donut({ slices, total, ccy }: { slices: StreamProgress[]; total: number; ccy: string }) {
  const R = 74, C = 2 * Math.PI * R;
  const parts = slices.filter((s) => s.earned > 0);
  let offset = 0;
  const summary = parts.length ? parts.map((s) => `${s.name} ${Math.round((s.earned / total) * 100)}%`).join(', ') : 'no income yet';
  return (
    <div className="stm-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Income by stream: ${summary}`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border-light)" strokeWidth="26" />
        {parts.map((s) => {
          const len = (s.earned / total) * C;
          const el = (
            <circle key={s.id} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="26"
              strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-offset}
              transform="rotate(-90 100 100)">
              <title>{`${s.name}: ${fmt(s.earned, ccy)} (${Math.round((s.earned / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="stm-donut-center">
        <div className="lbl">Earned</div>
        <div className="val">{total > 0 ? short(total, ccy) : '—'}</div>
      </div>
    </div>
  );
}

// ───────────────────────── progress row ─────────────────────────

function StreamRow({ s, elapsed, ccy, total }: { s: StreamProgress; elapsed: number; ccy: string; total: number }) {
  const st = STATUS[s.status];
  const fill = s.target ? Math.min(100, (s.earned / s.target) * 100) : total > 0 ? (s.earned / total) * 100 : 0;
  return (
    <div className="stm-row">
      <div className="stm-row-top">
        <span className="stm-name"><i style={{ background: s.color }} />{s.name}</span>
        <span className="stm-figs">
          <b>{fmt(s.earned, ccy)}</b>
          {s.target ? <span className="text-muted"> / {fmt(s.target, ccy)}</span> : null}
          {s.pct !== null && <span className="stm-pct">{s.pct}%</span>}
        </span>
      </div>
      <div className="stm-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)}
        aria-label={`${s.name}: ${s.target ? `${s.pct}% of target` : 'no target set'}`}>
        <div className="stm-fill" style={{ width: `${fill}%`, background: s.color }} />
        {s.target && elapsed > 0 && elapsed < 1 && (
          <div className="stm-pace" style={{ left: `${elapsed * 100}%` }} title={`Year ${Math.round(elapsed * 100)}% gone — on pace would be ${fmt(s.expectedByNow ?? 0, ccy)}`} />
        )}
      </div>
      <div className="stm-row-foot">
        <span className={`stm-chip ${st.cls}`}>{st.label}</span>
        <span className="text-muted">
          {s.status === 'achieved' ? `Beat it by ${fmt(s.earned - (s.target ?? 0), ccy)}`
            : s.remaining !== null ? `${fmt(s.remaining, ccy)} to go${s.perMonthNeeded ? ` · ${fmt(s.perMonthNeeded, ccy)}/month needed` : ''}`
            : s.id === '__unassigned__' ? 'Not in any stream — assign these categories' : 'Set a target to track progress'}
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── panel ─────────────────────────

export function IncomeStreamsPanel({ overview, streams, incomeCategories, currency }: {
  overview: StreamsOverview;
  streams: IncomeStream[];
  incomeCategories: string[];
  currency: string;
}) {
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<IncomeStream | 'new' | null>(null);
  const { year, elapsed, totalEarned, totalTarget, totalPct } = overview;
  const all = [...overview.streams, ...(overview.unassigned ? [overview.unassigned] : [])];
  const hasStreams = overview.streams.length > 0;

  return (
    <div className="card stm-card">
      <div className="df-panel-head">
        <span>Income streams — {year}</span>
        <button type="button" className="mini-btn" onClick={() => { setManage(true); setEditing(hasStreams ? null : 'new'); }}>
          {hasStreams ? 'Manage streams & targets' : '+ Add a stream'}
        </button>
      </div>

      {!hasStreams ? (
        <div className="stm-empty">
          <div className="big">Split your income into streams</div>
          <p>Salary, bug bounties, client work, teaching… give each one a yearly target and see how far along you are. Income already counts itself — nothing to type in.</p>
          <div className="stm-empty-actions">
            <ActionButton className="btn" pendingLabel="Creating…" action={async () => {
              const r = await createStreamsFromIncome(year);
              toast(r.message, r.ok ? 'success' : 'info', r.ok ? 'Now set a target on each one with “Manage streams & targets”.' : 'Add a stream by hand instead.');
            }}>Create streams from my income</ActionButton>
            <button type="button" className="btn-ghost" onClick={() => { setManage(true); setEditing('new'); }}>+ New stream</button>
          </div>
        </div>
      ) : (
        <div className="stm-body">
          {totalTarget !== null && (
            <div className="stm-total">
              <div className="stm-total-top">
                <span>Overall toward targets</span>
                <span><b>{fmt(overview.streams.filter((s) => s.target).reduce((n, s) => n + s.earned, 0), currency)}</b> <span className="text-muted">of {fmt(totalTarget, currency)}</span> <span className="stm-pct">{totalPct}%</span></span>
              </div>
              <div className="stm-track big">
                <div className="stm-fill" style={{ width: `${Math.min(100, totalPct ?? 0)}%`, background: 'var(--pine)' }} />
                {elapsed > 0 && elapsed < 1 && <div className="stm-pace" style={{ left: `${elapsed * 100}%` }} title={`Year ${Math.round(elapsed * 100)}% gone`} />}
              </div>
            </div>
          )}

          <div className="stm-split">
            <div className="stm-viz">
              <Donut slices={all} total={totalEarned} ccy={currency} />
              <ul className="stm-legend">
                {all.map((s) => (
                  <li key={s.id}><i style={{ background: s.color }} /><span>{s.name}</span>
                    <b>{totalEarned > 0 ? `${Math.round((s.earned / totalEarned) * 100)}%` : '0%'}</b></li>
                ))}
              </ul>
            </div>
            <div className="stm-rows">
              {all.map((s) => <StreamRow key={s.id} s={s} elapsed={elapsed} ccy={currency} total={totalEarned} />)}
            </div>
          </div>

          <div className="stm-table-wrap">
            <table className="stm-table">
              <thead><tr><th>Month</th>{all.map((s) => <th key={s.id}><i style={{ background: s.color }} />{s.name}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {MONTHS.map((m, i) => {
                  const row = all.reduce((n, s) => n + s.monthly[i]!, 0);
                  return (
                    <tr key={m}><td>{m}</td>
                      {all.map((s) => <td key={s.id} className={s.monthly[i] ? '' : 'zero'}>{s.monthly[i] ? fmt(s.monthly[i]!, currency) : '—'}</td>)}
                      <td className="tot">{row ? fmt(row, currency) : '—'}</td></tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Year</td>{all.map((s) => <td key={s.id}>{fmt(s.earned, currency)}</td>)}<td className="tot">{fmt(totalEarned, currency)}</td></tr></tfoot>
            </table>
          </div>
          <p className="stm-note">
            Counts income as received (after TDS), the same as Income YTD above. The pace tick assumes income arrives evenly through the year — lumpy payments will swing it.
          </p>
        </div>
      )}

      {manage && (
        <ManageModal year={year} streams={streams} categories={incomeCategories} currency={currency}
          editing={editing} setEditing={setEditing} onClose={() => { setManage(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ───────────────────────── manage modal ─────────────────────────

function ManageModal({ year, streams, categories, currency, editing, setEditing, onClose }: {
  year: number; streams: IncomeStream[]; categories: string[]; currency: string;
  editing: IncomeStream | 'new' | null; setEditing: (s: IncomeStream | 'new' | null) => void; onClose: () => void;
}) {
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-head"><h2>Income streams · {year} targets</h2><button type="button" className="modal-close" onClick={onClose}>✕</button></div>

        {editing === null ? (
          <>
            {streams.length === 0 && <p className="text-muted text-sm">No streams yet.</p>}
            <div className="stm-manage-list">
              {streams.map((s) => (
                <div key={s.id} className="stm-manage-row">
                  <i style={{ background: s.color }} />
                  <div className="stm-manage-main">
                    <div className="nm">{s.name}</div>
                    <div className="text-muted sub">
                      {s.targets[String(year)] ? `${fmt(s.targets[String(year)]!, currency)} target` : 'No target'} · {s.categories.length ? s.categories.join(', ') : 'no categories yet'}
                    </div>
                  </div>
                  <button type="button" className="mini-btn" onClick={() => setEditing(s)}>Edit</button>
                  <ActionButton className="mini-btn ghost" pendingLabel="…" confirm={`Delete the “${s.name}” stream? Your income entries stay; they just stop counting toward this target.`}
                    successMessage="Stream deleted" action={() => deleteStream(s.id)}>Delete</ActionButton>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
              <button type="button" className="btn" onClick={() => setEditing('new')}>+ New stream</button>
            </div>
          </>
        ) : (
          <StreamForm key={editing === 'new' ? 'new' : editing.id} year={year} stream={editing === 'new' ? null : editing}
            streams={streams} categories={categories} currency={currency}
            onBack={() => setEditing(null)} onSaved={() => setEditing(null)} />
        )}
      </div>
    </div>
  );
}

function StreamForm({ year, stream, streams, categories, currency, onBack, onSaved }: {
  year: number; stream: IncomeStream | null; streams: IncomeStream[]; categories: string[]; currency: string;
  onBack: () => void; onSaved: () => void;
}) {
  const [color, setColor] = useState(stream?.color ?? STREAM_COLORS[streams.length % STREAM_COLORS.length]!);
  const mine = new Set((stream?.categories ?? []).map((c) => c.toLowerCase()));
  const ownerOf = (c: string) => streams.find((s) => s.id !== stream?.id && s.categories.some((x) => x.toLowerCase() === c.toLowerCase()));
  const current = stream?.targets[String(year)];

  return (
    <form action={async (fd) => {
      try {
        const r = await saveStream(fd);
        toast(r.message, r.ok ? 'success' : 'error');
        if (r.ok) onSaved();
      } catch (e) { toast('Couldn’t save the stream', 'error', e instanceof Error ? e.message : undefined); }
    }}>
      {stream && <input type="hidden" name="id" value={stream.id} />}
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="color" value={color} />

      <div className="grid-2-eq" style={{ marginBottom: 12 }}>
        <div>
          <label className="field-label" htmlFor="stm-name">Stream name</label>
          <input id="stm-name" name="name" required defaultValue={stream?.name} placeholder="e.g. Bug bounty" maxLength={40} style={{ width: '100%' }} autoFocus />
        </div>
        <div>
          <label className="field-label" htmlFor="stm-target">{year} target ({currency === 'INR' ? '₹' : currency})</label>
          <input id="stm-target" name="target" inputMode="numeric" defaultValue={current ?? ''} placeholder="e.g. 300000" style={{ width: '100%' }} />
        </div>
      </div>

      <label className="field-label">Colour</label>
      <div className="stm-swatches" role="radiogroup" aria-label="Stream colour">
        {STREAM_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} className={c === color ? 'on' : ''}
            style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>

      <label className="field-label" style={{ marginTop: 14 }}>Income that counts toward this stream</label>
      <p className="text-muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>
        Income files itself by its category when a project, bounty, salary or due posts it. Tick the categories that belong here — a category can sit in one stream only.
      </p>
      {categories.length === 0 ? (
        <p className="text-muted text-sm">No income has been posted yet. Once it has, its categories show up here.</p>
      ) : (
        <div className="stm-cats">
          {categories.map((c) => {
            const other = ownerOf(c);
            return (
              <label key={c} className="stm-cat">
                <input type="checkbox" name="categories" value={c} defaultChecked={mine.has(c.toLowerCase())} />
                <span>{c}</span>
                {other && <em>moves from {other.name}</em>}
              </label>
            );
          })}
        </div>
      )}

      <div className="modal-foot">
        <button type="button" className="btn-ghost" onClick={onBack}>Back</button>
        <SubmitButton className="btn" pendingLabel="Saving…">{stream ? 'Save stream' : 'Add stream'}</SubmitButton>
      </div>
    </form>
  );
}
