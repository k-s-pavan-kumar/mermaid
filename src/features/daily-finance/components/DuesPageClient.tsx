'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ObligationView } from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import { deleteObligation, deleteFinanceEntry } from '../actions';
import { AddObligationModal, SettleObligationModal } from './DailyFinanceClient';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
function shortDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

type Filter = 'all' | 'open' | 'cleared';

export function DuesPageClient({
  monthLabel, isCurrentMonth, prevHref, nextHref, obligations, currency, customCategories,
}: {
  monthLabel: string;
  isCurrentMonth: boolean;
  prevHref: string;
  nextHref: string;
  obligations: ObligationView[];
  currency: string;
  customCategories: string[];
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [settling, setSettling] = useState<ObligationView | null>(null);
  const money = (n: number) => fmt(n, currency);

  const categories = useMemo(
    () => [...EXPENSE_CATEGORIES.filter((c) => c !== 'Wishlist purchase'), ...customCategories],
    [customCategories]
  );

  const visible = obligations.filter((v) =>
    filter === 'all' ? true : filter === 'cleared' ? v.status === 'cleared' : v.status !== 'cleared'
  );
  const payables = visible.filter((v) => v.obligation.direction === 'payable');
  const receivables = visible.filter((v) => v.obligation.direction === 'receivable');

  const allPay = obligations.filter((v) => v.obligation.direction === 'payable');
  const allRecv = obligations.filter((v) => v.obligation.direction === 'receivable');
  const sum = (rows: ObligationView[], f: (v: ObligationView) => number) => rows.reduce((n, v) => n + f(v), 0);
  const openCount = obligations.filter((v) => v.status !== 'cleared').length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href={prevHref} className="btn-ghost" style={{ fontSize: 13, padding: '5px 11px' }} aria-label="Previous month">‹</Link>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 18, minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
          <Link href={nextHref} className="btn-ghost" style={{ fontSize: 13, padding: '5px 11px' }} aria-label="Next month">›</Link>
          {!isCurrentMonth && <Link href="/daily-finance/dues" className="link-btn" style={{ fontSize: 12 }}>This month</Link>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="df-toggle">
            {(['all', 'open', 'cleared'] as Filter[]).map((f) => (
              <button key={f} type="button" className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'open' ? `Open (${openCount})` : 'Cleared'}
              </button>
            ))}
          </div>
          <button type="button" className="btn" style={{ fontSize: 13 }} onClick={() => setAddOpen(true)}>+ Add due</button>
          <Link href="/daily-finance" className="link-btn" style={{ fontSize: 12 }}>← Daily Finance</Link>
        </div>
      </div>

      {obligations.length === 0 ? (
        <div className="card">
          <div className="empty">
            <img src="/mascot/idle.png" alt="" width={72} height={72} />
            <div className="big">No dues for {monthLabel}</div>
            Add a college fee, a loan you&apos;re clearing, or money a friend owes you — then log each payment as it happens.
          </div>
        </div>
      ) : (
        <>
          {allPay.length > 0 && (
            <div className="stats" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="lbl">To pay · {monthLabel}</div><div className="val">{money(sum(allPay, (v) => v.need ?? 0))}</div></div>
              <div className="stat"><div className="lbl">Paid so far</div><div className="val pos">{money(sum(allPay, (v) => v.paid))}</div></div>
              <div className="stat"><div className="lbl">Balance left</div><div className="val neg">{money(sum(allPay, (v) => v.balance ?? 0))}</div></div>
            </div>
          )}
          {allRecv.length > 0 && (
            <div className="stats" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="lbl">To receive · {monthLabel}</div><div className="val">{money(sum(allRecv, (v) => v.need ?? 0))}</div></div>
              <div className="stat"><div className="lbl">Received so far</div><div className="val pos">{money(sum(allRecv, (v) => v.paid))}</div></div>
              <div className="stat"><div className="lbl">Still to come</div><div className="val neg">{money(sum(allRecv, (v) => v.balance ?? 0))}</div></div>
            </div>
          )}

          {visible.length === 0 && (
            <p className="text-muted text-sm">Nothing matches this filter.</p>
          )}
          {payables.length > 0 && (
            <DuesTable title="You need to pay" payable rows={payables} money={money} onPay={setSettling} />
          )}
          {receivables.length > 0 && (
            <DuesTable title="Owed to you" payable={false} rows={receivables} money={money} onPay={setSettling} />
          )}

          <p className="text-muted" style={{ fontSize: 12, marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
            Each payment you add posts a real entry to your Daily Finance ledger. Scroll sideways when there are many payments. Monthly dues start fresh every month;
            use the arrows to look back at earlier months.
          </p>
        </>
      )}

      {addOpen && <AddObligationModal onClose={() => setAddOpen(false)} categories={categories} />}
      {settling && <SettleObligationModal view={settling} onClose={() => setSettling(null)} money={money} />}
    </>
  );
}

function DuesTable({
  title, payable, rows, money, onPay,
}: {
  title: string;
  payable: boolean;
  rows: ObligationView[];
  money: (n: number) => string;
  onPay: (v: ObligationView) => void;
}) {
  // One Amount/Date pair per payment made — as many as the busiest row needs.
  const n = Math.max(1, ...rows.map((r) => r.payments.length));
  // The monthly due-date column only exists when some row has one.
  const hasDates = rows.some((r) => r.dueDate);
  const payWord = payable ? 'Payment' : 'Received';
  const takenWord = payable ? 'Taken on' : 'Given on';
  const needTotal = rows.reduce((t, r) => t + (r.need ?? 0), 0);
  const paidTotal = rows.reduce((t, r) => t + r.paid, 0);
  const balTotal = rows.reduce((t, r) => t + (r.balance ?? 0), 0);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="df-panel-head"><span>{title}</span></div>
      <div className="df-scroll">
        <table className="df-dues wide">
          <thead>
            <tr>
              <th rowSpan={2} className="name">Name</th>
              <th colSpan={hasDates ? 3 : 2} className="grp grp-start">Need to {payable ? 'pay' : 'receive'}</th>
              {Array.from({ length: n }, (_, i) => (
                <th key={i} colSpan={2} className="grp grp-start">{payWord} {i + 1}</th>
              ))}
              <th rowSpan={2} className="num">Balance</th>
              <th rowSpan={2}>Status</th>
              <th rowSpan={2} />
            </tr>
            <tr>
              <th className="num sub grp-start">Amount</th><th className="sub">{takenWord}</th>{hasDates && <th className="sub">Due date</th>}
              {Array.from({ length: n }, (_, i) => (
                <FragmentHead key={i} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((ov) => {
              const o = ov.obligation;
              const statusLabel = ov.overdue ? 'Overdue' : ov.status === 'cleared' ? 'Cleared' : ov.status === 'partial' ? 'Partial' : 'Pending';
              const statusClass = ov.overdue ? 'overdue' : ov.status;
              return (
                <tr key={o.id} className={ov.status === 'cleared' ? 'cleared' : ''}>
                  <td className="name">
                    <div className="df-cat">{o.label}</div>
                    <div className="df-note">{o.category} · {o.cadence === 'monthly' ? 'Monthly' : 'One-time'}</div>
                  </td>
                  <td className="num grp-start">{ov.need !== null ? money(ov.need) : '—'}</td>
                  <td>{ov.takenDate ? shortDay(ov.takenDate) : <span className="text-muted">—</span>}</td>
                  {hasDates && <td>{ov.dueDate ? shortDay(ov.dueDate) : <span className="text-muted">—</span>}</td>}
                  {Array.from({ length: n }, (_, i) => {
                    const p = ov.payments[i];
                    return p ? (
                      <PayCells key={i} amount={money(p.amount)} date={shortDay(p.date)} onDelete={() => void deleteFinanceEntry(p.id)} />
                    ) : (
                      <PayCells key={i} />
                    );
                  })}
                  <td className={`num ${ov.balance ? 'df-bal-open' : ''}`}>{ov.balance === null ? '—' : money(ov.balance)}</td>
                  <td><span className={`df-status ${statusClass}`}>{statusLabel}</span></td>
                  <td className="df-due-actions">
                    {ov.status !== 'cleared' && (
                      <button type="button" className="btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => onPay(ov)}>
                        {payable ? '+ Pay' : '+ Receive'}
                      </button>
                    )}
                    <button type="button" className="df-del" title="Remove this due" onClick={() => void deleteObligation(o.id)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num grp-start">{money(needTotal)}</td>
              <td />
              {hasDates && <td />}
              <td colSpan={n * 2} className="num grp-start">{payable ? 'Paid' : 'Received'}: {money(paidTotal)}</td>
              <td className="num df-bal-open">{money(balTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FragmentHead() {
  return (
    <>
      <th className="num sub grp-start">Amount</th>
      <th className="sub">Date</th>
    </>
  );
}

function PayCells({ amount, date, onDelete }: { amount?: string; date?: string; onDelete?: () => void }) {
  return (
    <>
      <td className="num grp-start">{amount ?? <span className="text-muted">—</span>}</td>
      <td>
        {date ?? <span className="text-muted">—</span>}
        {onDelete && (
          <button type="button" className="df-del" title="Delete this payment" style={{ marginLeft: 4 }} onClick={onDelete}>×</button>
        )}
      </td>
    </>
  );
}
