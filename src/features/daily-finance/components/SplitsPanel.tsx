'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FinanceSplitRule, SetAsideSummary } from '../types';
import { saveSplitRule, toggleSplitRule, deleteSplitRule } from '../actions';
import { ActionButton } from '@/components/ActionButton';
import { SubmitButton } from '@/components/SubmitButton';
import { toast } from '@/lib/toast';

/**
 * "Set aside from invoices": rules like "Sister · 10%". They post nothing by
 * themselves — each one carves its share out of an invoice payment the
 * moment that payment is recorded (see set-aside.ts).
 */
export function SplitsPanel({
  rules, month, year, money,
}: {
  rules: FinanceSplitRule[];
  month: SetAsideSummary;
  year: SetAsideSummary;
  money: (n: number) => string;
}) {
  const [editing, setEditing] = useState<FinanceSplitRule | 'new' | null>(null);
  const activePct = rules.filter((r) => r.active).reduce((n, r) => n + r.pct, 0);

  return (
    <div className="card">
      <div className="df-panel-head">
        <span>Set aside from invoices</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/daily-finance/investments" className="link-btn" style={{ fontSize: 12 }}>Investments log →</Link>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditing('new')}>+ Add rule</button>
        </span>
      </div>
      <div style={{ padding: '14px 16px 12px' }}>
        {rules.length === 0 ? (
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            Give part of every invoice to someone — say 10% to your sister. It&apos;s taken automatically
            each time an invoice payment is recorded.
          </p>
        ) : (
          <>
            {rules.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', opacity: r.active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="df-cat">{r.label} · {Math.round(r.pct * 100) / 100}%</div>
                  <div className="df-note">{r.active ? 'Taken from every invoice payment' : 'Paused'}</div>
                </div>
                <button type="button" className="btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => setEditing(r)}>Edit</button>
                <ActionButton
                  className="btn-ghost"
                  style={{ fontSize: 11.5, padding: '3px 8px' }}
                  action={async () => {
                    const res = await toggleSplitRule(r.id, !r.active);
                    if (!res.ok && res.message) toast(res.message, 'error');
                  }}
                >{r.active ? 'Pause' : 'Resume'}</ActionButton>
                <ActionButton className="df-del" title="Remove rule (past entries stay)" confirm="Remove this rule? Entries it already posted stay in your ledger." action={() => deleteSplitRule(r.id)}>×</ActionButton>
              </div>
            ))}
            <p className="text-muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
              {Math.round(activePct * 100) / 100}% of each payment is set aside; {Math.round((100 - activePct) * 100) / 100}% stays with you.
            </p>
          </>
        )}

        {(month.family > 0 || year.family > 0) && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-light)', fontSize: 12.5, display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">This month · given</span><b>{money(month.family)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">This year · given</span><b>{money(year.family)}</b></div>
          </div>
        )}
      </div>
      {editing && <RuleModal rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} money={money} />}
    </div>
  );
}

function RuleModal({
  rule, onClose, money,
}: { rule: FinanceSplitRule | null; onClose: () => void; money: (n: number) => string }) {
  const [pct, setPct] = useState(String(rule?.pct ?? 10));
  const [error, setError] = useState<string | null>(null);
  const share = Math.round(100_000 * (Number(pct) || 0)) / 100;

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{rule ? 'Edit rule' : 'New set-aside rule'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          Taken from the cash that actually arrives on each invoice payment (after TDS), the moment you record it.
          Invoices already paid aren&apos;t touched.
        </p>
        <form action={async (fd) => {
          const res = await saveSplitRule(fd);
          if (!res.ok) { setError(res.message); return; }
          toast(res.message);
          onClose();
        }}>
          {rule && <input type="hidden" name="id" value={rule.id} />}
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="r-label">For</label>
              <input id="r-label" name="label" type="text" required defaultValue={rule?.label ?? 'Sister'} placeholder="e.g. Sister" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="r-pct">Percent of each payment</label>
              <input id="r-pct" name="pct" type="number" min={0.01} max={100} step="0.01" required value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          <p className="text-muted text-sm" style={{ margin: '12px 0 0' }}>
            Example: on a {money(100_000)} payment this sets aside <b>{money(share)}</b>.
          </p>
          {error && <p style={{ color: 'var(--crimson)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <SubmitButton className="btn">{rule ? 'Save rule' : 'Add rule'}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
