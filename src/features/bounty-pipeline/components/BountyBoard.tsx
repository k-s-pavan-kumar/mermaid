'use client';

import { useState } from 'react';
import type { BountyCase } from '../types';
import { activePayout, SEVERITY_ORDER } from '../types';
import {
  logSubmission, moveToTriaged, moveToAccepted, moveToPaid, moveBack,
  markRejectedOrDuplicate, deleteBountyCase,
} from '../actions';

function fmt(n: number | null, ccy = 'INR') {
  if (n === null) return '—';
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
function pretty(iso: string | null) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

const SEV_CLASS: Record<string, string> = { critical: 'rust', high: 'amber', medium: 'blue', low: 'slate' };

const COLUMNS: { key: BountyCase['status']; label: string }[] = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'paid', label: 'Paid' },
];

export function BountyBoard({ cases }: { cases: BountyCase[] }) {
  const [logOpen, setLogOpen] = useState(false);
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);

  const closed = cases.filter((c) => c.status === 'rejected' || c.status === 'duplicate');

  return (
    <>
      <div className="bb-kanban">
        {COLUMNS.map((col) => {
          const items = cases.filter((c) => c.status === col.key);
          return (
            <div key={col.key} className="bb-col">
              <div className="bb-col-head">
                <span className="bb-col-title">{col.label}</span>
                <span className="bb-col-count">{items.length}</span>
              </div>
              {items.map((c) => {
                const { amount, kind } = activePayout(c);
                const dateLabel =
                  col.key === 'submitted' ? `Submitted ${pretty(c.submitted_at)}`
                  : col.key === 'triaged' ? `Triaged ${pretty(c.triaged_at)}`
                  : col.key === 'accepted' ? `Accepted ${pretty(c.accepted_at)}`
                  : `Paid ${pretty(c.paid_at)}`;
                return (
                  <div key={c.id} className="bb-card">
                    <div className="bb-card-top">
                      <div className="bb-card-title">{c.title}</div>
                      <span className={`bb-sev ${SEV_CLASS[c.severity]}`}>{c.severity}</span>
                    </div>
                    <div className="bb-card-prog">
                      {c.program_name}
                      {col.key === 'accepted' && ' · Bounty confirmed, payment processing'}
                      {col.key === 'paid' && ' · Paid — posted to Daily Finance'}
                    </div>
                    <div className="bb-card-foot">
                      <span className={`bb-payout ${kind ?? ''}`}>{fmt(amount, c.currency)} {kind === 'estimate' ? '(est.)' : kind === 'confirmed' ? 'confirmed' : kind === 'paid' ? 'paid' : ''}</span>
                      <span className="bb-card-date">{dateLabel}</span>
                    </div>
                    <div className="bb-card-actions">
                      {col.key === 'submitted' && (
                        <>
                          <button type="button" className="mini-btn" onClick={() => void moveToTriaged(c.id)}>Move to Triaged →</button>
                          <button type="button" className="mini-btn ghost" onClick={() => void markRejectedOrDuplicate(c.id, 'rejected')}>Reject</button>
                        </>
                      )}
                      {col.key === 'triaged' && (
                        <>
                          <button type="button" className="mini-btn" onClick={() => setAcceptId(c.id)}>Move to Accepted →</button>
                          <button type="button" className="mini-btn ghost" onClick={() => void moveBack(c.id, 'submitted')}>← Back</button>
                          <button type="button" className="mini-btn ghost" onClick={() => void markRejectedOrDuplicate(c.id, 'duplicate')}>Duplicate</button>
                        </>
                      )}
                      {col.key === 'accepted' && (
                        <>
                          <button type="button" className="mini-btn" onClick={() => setPayId(c.id)}>Move to Paid →</button>
                          <button type="button" className="mini-btn ghost" onClick={() => void moveBack(c.id, 'triaged')}>← Back</button>
                        </>
                      )}
                      {col.key === 'paid' && (
                        <button type="button" className="mini-btn ghost" onClick={() => void deleteBountyCase(c.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {col.key === 'submitted' && (
                <div className="bb-add-card" onClick={() => setLogOpen(true)}>+ Log a submission</div>
              )}
            </div>
          );
        })}
      </div>

      {closed.length > 0 && (
        <div className="bb-closed">
          <div className="section-title" style={{ marginTop: 22 }}><h3>Rejected / duplicate</h3></div>
          <div className="card">
            {closed.map((c) => (
              <div key={c.id} className="bb-closed-row">
                <span>{c.title}</span>
                <span className="text-muted text-sm">{c.program_name} · {c.status}</span>
                <button type="button" className="mini-btn ghost" onClick={() => void deleteBountyCase(c.id)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {logOpen && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setLogOpen(false); }}>
          <div className="modal">
            <div className="modal-head"><h2>Log a submission</h2><button type="button" className="modal-close" onClick={() => setLogOpen(false)}>✕</button></div>
            <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>Starts in &ldquo;Submitted&rdquo; — move it along as the program responds.</p>
            <form action={async (fd) => { await logSubmission(fd); setLogOpen(false); }}>
              <div style={{ marginBottom: 12 }}>
                <label className="field-label" htmlFor="title">Vulnerability title</label>
                <input id="title" name="title" required placeholder="e.g. IDOR on export endpoint" style={{ width: '100%' }} />
              </div>
              <div className="grid-2-eq">
                <div>
                  <label className="field-label" htmlFor="program_name">Program</label>
                  <input id="program_name" name="program_name" required placeholder="e.g. HackerOne — Acme Corp" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="severity">Severity</label>
                  <select id="severity" name="severity" defaultValue="high" style={{ width: '100%' }}>
                    {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="field-label" htmlFor="estimated_payout">Estimated payout</label>
                <input id="estimated_payout" name="estimated_payout" type="number" min={0} step="1" placeholder="10000" style={{ width: '100%' }} />
              </div>
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setLogOpen(false)}>Cancel</button>
                <button type="submit" className="btn">Add to Submitted</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {acceptId && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setAcceptId(null); }}>
          <div className="modal">
            <div className="modal-head"><h2>Program response</h2><button type="button" className="modal-close" onClick={() => setAcceptId(null)}>✕</button></div>
            <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>What did the program confirm as the payout?</p>
            <form action={async (fd) => { await moveToAccepted(acceptId, fd); setAcceptId(null); }}>
              <label className="field-label" htmlFor="confirmed_payout">Confirmed payout</label>
              <input id="confirmed_payout" name="confirmed_payout" type="number" min={0} step="1" required style={{ width: '100%' }} />
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setAcceptId(null)}>Cancel</button>
                <button type="submit" className="btn">Move to Accepted</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payId && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setPayId(null); }}>
          <div className="modal">
            <div className="modal-head"><h2>Mark paid</h2><button type="button" className="modal-close" onClick={() => setPayId(null)}>✕</button></div>
            <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>Posts automatically to Daily Finance as income once saved.</p>
            <form action={async (fd) => { await moveToPaid(payId, fd); setPayId(null); }}>
              <label className="field-label" htmlFor="paid_amount">Amount actually paid</label>
              <input id="paid_amount" name="paid_amount" type="number" min={0} step="1"
                defaultValue={cases.find((c) => c.id === payId)?.confirmed_payout ?? undefined} style={{ width: '100%' }} />
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setPayId(null)}>Cancel</button>
                <button type="submit" className="btn">Move to Paid</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
