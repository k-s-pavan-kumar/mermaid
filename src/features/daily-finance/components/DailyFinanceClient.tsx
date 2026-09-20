'use client';

import { useMemo, useState } from 'react';
import type { DayGroup } from '../types';
import type { MonthRow } from '../queries';
import { EXPENSE_CATEGORIES } from '../types';
import { logExpense, deleteFinanceEntry } from '../actions';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
function prettyDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function dow(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

const SOURCE_LABEL: Record<string, string> = {
  invoice_payment: 'Project',
  bounty_payout: 'Bounty',
  reward_vault: 'Reward Vault',
};

export function DailyFinanceClient({
  monthLabel, days, monthTotals, categoryBreakdown, dailyNet,
  yearLabel, yearTotals, monthRows, currency,
}: {
  monthLabel: string;
  days: DayGroup[];
  monthTotals: { income: number; expense: number; net: number };
  categoryBreakdown: { category: string; amount: number }[];
  dailyNet: { date: string; net: number }[];
  yearLabel: string;
  yearTotals: { income: number; expense: number; net: number };
  monthRows: MonthRow[];
  currency: string;
}) {
  const [view, setView] = useState<'month' | 'year'>('month');
  const [modalOpen, setModalOpen] = useState(false);
  const money = (n: number) => fmt(n, currency);

  const maxCategory = Math.max(1, ...categoryBreakdown.map((c) => c.amount));
  const maxNet = Math.max(1, ...dailyNet.map((d) => Math.abs(d.net)));
  const maxYearFig = Math.max(1, ...monthRows.map((m) => Math.max(m.income, m.expense)));

  return (
    <>
      <div className="df-toggle">
        <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        <button type="button" className={view === 'year' ? 'active' : ''} onClick={() => setView('year')}>Year</button>
      </div>

      {view === 'month' ? (
        <>
          <div className="stats" style={{ marginBottom: 20 }}>
            <div className="stat"><div className="lbl">Income · {monthLabel}</div><div className="val pos">{money(monthTotals.income)}</div></div>
            <div className="stat"><div className="lbl">Expenses · {monthLabel}</div><div className="val neg">{money(monthTotals.expense)}</div></div>
            <div className="stat"><div className="lbl">Net</div><div className={`val ${monthTotals.net >= 0 ? 'pos' : 'neg'}`}>{money(monthTotals.net)}</div></div>
          </div>

          <div className="df-grid">
            <div className="card df-ledger">
              <div className="df-panel-head">
                <span>{monthLabel}</span>
                <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setModalOpen(true)}>+ Add expense</button>
              </div>
              {days.length === 0 ? (
                <div className="empty">
                  <img src="/mascot/idle.png" alt="" width={72} height={72} />
                  <div className="big">Nothing logged yet</div>
                  Log an expense to start the ledger for this month.
                </div>
              ) : days.map((d) => (
                <div key={d.date} className="df-day-group">
                  <div className="df-day-head">
                    <div><span className="df-date">{prettyDay(d.date)}</span><span className="df-dow">{dow(d.date)}</span></div>
                    <div className={`df-net ${d.net >= 0 ? 'pos' : 'neg'}`}>{d.net >= 0 ? '+' : ''}{money(d.net)}</div>
                  </div>
                  {d.entries.map((e) => (
                    <div key={e.id} className="df-entry">
                      <span className={`df-dot ${e.type}`} />
                      <div className="df-entry-text">
                        <div className="df-cat">{e.category}</div>
                        {e.note && <div className="df-note">{e.note}</div>}
                        {e.source !== 'manual' && (
                          <span className="df-tag">🔗 {SOURCE_LABEL[e.source] ?? e.source} · Auto-posted</span>
                        )}
                      </div>
                      <span className={`df-amt ${e.type === 'income' ? 'pos' : 'neg'}`}>
                        {e.type === 'income' ? '+' : '−'}{money(e.amount)}
                      </span>
                      {(e.source === 'manual' || e.source === 'reward_vault') && (
                        <button type="button" className="df-del" title="Delete" onClick={() => void deleteFinanceEntry(e.id)}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="df-charts">
              <div className="card">
                <div className="df-panel-head"><span>Spending by category</span></div>
                <div style={{ padding: 16 }}>
                  {categoryBreakdown.length === 0 ? (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>No expenses yet this month.</p>
                  ) : categoryBreakdown.map((c) => (
                    <div key={c.category} className="df-bar-row">
                      <div className="df-bar-top"><span className="name">{c.category}</span><span className="val">{money(c.amount)}</span></div>
                      <div className="df-bar-track"><div className="df-bar-fill" style={{ width: `${(c.amount / maxCategory) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="df-panel-head"><span>Daily net</span></div>
                <div style={{ padding: 16 }}>
                  {dailyNet.length === 0 ? (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>Nothing to chart yet.</p>
                  ) : (
                    <div className="df-spark">
                      {dailyNet.map((d) => (
                        <div key={d.date} className={`df-spark-bar ${d.net >= 0 ? 'pos' : 'neg'}`}
                          style={{ height: `${Math.max(6, (Math.abs(d.net) / maxNet) * 100)}%` }}
                          title={`${prettyDay(d.date)} · ${d.net >= 0 ? '+' : ''}${money(d.net)}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <p className="text-muted" style={{ fontSize: 12, marginTop: 16, maxWidth: 700, lineHeight: 1.6 }}>
            <strong>Income only ever posts from something already earned.</strong> The moment a project invoice, or a
            bug bounty, is marked paid, it lands here automatically. There&apos;s no manual &ldquo;add income&rdquo;
            anywhere — the form above only takes expenses.
          </p>
        </>
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 20 }}>
            <div className="stat"><div className="lbl">Income · {yearLabel} YTD</div><div className="val pos">{money(yearTotals.income)}</div></div>
            <div className="stat"><div className="lbl">Expenses · {yearLabel} YTD</div><div className="val neg">{money(yearTotals.expense)}</div></div>
            <div className="stat"><div className="lbl">Net savings YTD</div><div className={`val ${yearTotals.net >= 0 ? 'pos' : 'neg'}`}>{money(yearTotals.net)}</div></div>
          </div>

          <div className="card">
            <div className="df-panel-head"><span>Income vs. expenses — {yearLabel}</span></div>
            <div style={{ padding: '20px 18px 8px' }}>
              <div className="df-legend">
                <span><i style={{ background: 'var(--sage)' }} />Income</span>
                <span><i style={{ background: 'var(--crimson)' }} />Expenses</span>
              </div>
              <div className="df-year-bars">
                {monthRows.map((m) => (
                  <div key={m.month} className="df-year-col">
                    <div className="df-bar-pair">
                      <div className="df-ybar income" style={{ height: `${(m.income / maxYearFig) * 100}%` }} title={`${m.label}: ${money(m.income)} income`} />
                      <div className="df-ybar expense" style={{ height: `${(m.expense / maxYearFig) * 100}%` }} title={`${m.label}: ${money(m.expense)} expenses`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="df-year-labels">{monthRows.map((m) => <div key={m.month}>{m.label}</div>)}</div>
            </div>

            <div className="df-month-list">
              <div className="df-ml-row head"><div>Month</div><div>Income</div><div>Expenses</div><div>Net</div></div>
              {monthRows.map((m) => (
                <div key={m.month} className="df-ml-row">
                  <div className="m">{m.label}</div>
                  <div className="in">+{money(m.income)}</div>
                  <div className="out">−{money(m.expense)}</div>
                  <div className="net">{money(m.net)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {modalOpen && <AddExpenseModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>Add expense</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          Income isn&apos;t added here — it posts on its own from a project payment or bounty payout.
        </p>
        <form
          action={async (fd) => { await logExpense(fd); onClose(); }}
        >
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="date">Date</label>
              <input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="amount">Amount</label>
              <input id="amount" name="amount" type="number" min={0.01} step="0.01" required placeholder="1000" style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="category">Category</label>
            <select id="category" name="category" required style={{ width: '100%' }}>
              {EXPENSE_CATEGORIES.filter((c) => c !== 'Wishlist purchase').map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="note">Note</label>
            <input id="note" name="note" type="text" placeholder="e.g. Groceries" style={{ width: '100%' }} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Add expense</button>
          </div>
        </form>
      </div>
    </div>
  );
}
