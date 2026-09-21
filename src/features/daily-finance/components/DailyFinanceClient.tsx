'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DayGroup, FinanceCategoryRule, ObligationView } from '../types';
import type { MonthRow } from '../queries';
import { EXPENSE_CATEGORIES, matchCategoryForLabel } from '../types';
import {
  logExpense, deleteFinanceEntry, logSalary,
  createObligation, settleObligation, deleteObligation,
  addCategoryRule, deleteCategoryRule,
} from '../actions';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}
function prettyDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function shortDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function dow(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

const SOURCE_LABEL: Record<string, string> = {
  invoice_payment: 'Project',
  bounty_payout: 'Bounty',
  reward_vault: 'Reward Vault',
  salary: 'Salary',
  obligation: 'Due',
};

export function DailyFinanceClient({
  monthLabel, days, monthTotals, categoryBreakdown, dailyNet,
  yearLabel, yearTotals, monthRows, currency,
  customCategories, categoryRules, obligations, tdsYtd,
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
  customCategories: string[];
  categoryRules: FinanceCategoryRule[];
  obligations: ObligationView[];
  tdsYtd: number;
}) {
  const [view, setView] = useState<'month' | 'year'>('month');
  const [modalOpen, setModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [dueModalOpen, setDueModalOpen] = useState(false);
  const [settling, setSettling] = useState<ObligationView | null>(null);
  const money = (n: number) => fmt(n, currency);

  const allCategories = useMemo(
    () => [...EXPENSE_CATEGORIES.filter((c) => c !== 'Wishlist purchase'), ...customCategories],
    [customCategories]
  );

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
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setSalaryModalOpen(true)}>+ Add salary</button>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setModalOpen(true)}>+ Add expense</button>
                </span>
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
                        {!!e.tds_amount && (
                          <span className="df-tag" title="Deducted at source by the payer">TDS {money(e.tds_amount)} deducted</span>
                        )}
                      </div>
                      <span className={`df-amt ${e.type === 'income' ? 'pos' : 'neg'}`}>
                        {e.type === 'income' ? '+' : '−'}{money(e.amount)}
                      </span>
                      {['manual', 'reward_vault', 'salary', 'obligation'].includes(e.source) && (
                        <button type="button" className="df-del" title="Delete" onClick={() => void deleteFinanceEntry(e.id)}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="df-charts">
              <div className="card">
                <div className="df-panel-head">
                  <span>Dues</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Link href="/daily-finance/dues" className="link-btn" style={{ fontSize: 12 }}>Open full page →</Link>
                    <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setDueModalOpen(true)}>+ Add due</button>
                  </span>
                </div>
                <div style={{ padding: '14px 16px 8px' }}>
                  {obligations.length === 0 ? (
                    <p className="text-muted text-sm" style={{ margin: '0 0 8px' }}>
                      Nothing tracked yet — add a college fee, a loan you&apos;re clearing, or money someone owes you.
                      Enter how much and by when, then add each payment as you make it; the balance updates here.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="df-dues">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th className="num">Need to pay</th>
                            <th className="num">Paid</th>
                            <th className="num">Balance</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        {obligations.map((ov) => {
                          const { obligation: o } = ov;
                          const payable = o.direction === 'payable';
                          const statusLabel = ov.overdue ? 'Overdue' : ov.status === 'cleared' ? 'Cleared' : ov.status === 'partial' ? 'Partial' : 'Pending';
                          const statusClass = ov.overdue ? 'overdue' : ov.status;
                          return (
                            <tbody key={o.id} className={ov.status === 'cleared' ? 'cleared' : ''}>
                              <tr>
                                <td>
                                  <div className="df-cat">{o.label}</div>
                                  <div className="df-note">
                                    {payable ? 'You owe' : 'Owed to you'} · {o.category} · {o.cadence === 'monthly' ? 'Monthly' : 'One-time'}
                                  </div>
                                </td>
                                <td className="num">
                                  {ov.need !== null ? money(ov.need) : '—'}
                                  {ov.dueDate && <div className="df-note">by {shortDay(ov.dueDate)}</div>}
                                </td>
                                <td className="num">{money(ov.paid)}</td>
                                <td className={`num ${ov.balance ? 'df-bal-open' : ''}`}>{ov.balance === null ? '—' : money(ov.balance)}</td>
                                <td><span className={`df-status ${statusClass}`}>{statusLabel}</span></td>
                                <td className="df-due-actions">
                                  {ov.status !== 'cleared' && (
                                    <button type="button" className="btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => setSettling(ov)}>
                                      {payable ? '+ Pay' : '+ Receive'}
                                    </button>
                                  )}
                                  <button type="button" className="df-del" title="Remove this due" onClick={() => void deleteObligation(o.id)}>×</button>
                                </td>
                              </tr>
                              {ov.payments.length > 0 && (
                                <tr className="pay-row">
                                  <td colSpan={6}>
                                    <span className="df-pay-label">{payable ? 'Paid' : 'Received'}:</span>
                                    {ov.payments.map((p) => (
                                      <span key={p.id} className="df-pay-chip">
                                        {money(p.amount)} · {shortDay(p.date)}
                                        <button type="button" className="df-del" title="Delete this payment" onClick={() => void deleteFinanceEntry(p.id)}>×</button>
                                      </span>
                                    ))}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          );
                        })}
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
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
            <strong>Income only ever posts from something already earned.</strong> A project invoice or bug bounty
            being marked paid posts here automatically, and so does every payment you add against a due. Salary is the
            one thing you type in directly — there&apos;s no other event in the app that would create it.
          </p>
        </>
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 20 }}>
            <div className="stat"><div className="lbl">Income · {yearLabel} YTD</div><div className="val pos">{money(yearTotals.income)}</div></div>
            <div className="stat"><div className="lbl">Expenses · {yearLabel} YTD</div><div className="val neg">{money(yearTotals.expense)}</div></div>
            <div className="stat"><div className="lbl">Net savings YTD</div><div className={`val ${yearTotals.net >= 0 ? 'pos' : 'neg'}`}>{money(yearTotals.net)}</div></div>
            <div className="stat"><div className="lbl">TDS deducted · {yearLabel} YTD</div><div className="val">{money(tdsYtd)}</div></div>
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

      {modalOpen && <AddExpenseModal onClose={() => setModalOpen(false)} categories={allCategories} rules={categoryRules} />}
      {salaryModalOpen && <AddSalaryModal onClose={() => setSalaryModalOpen(false)} />}
      {dueModalOpen && <AddObligationModal onClose={() => setDueModalOpen(false)} categories={allCategories} />}
      {settling && <SettleObligationModal view={settling} onClose={() => setSettling(null)} money={money} />}
    </>
  );
}

function AddExpenseModal({ onClose, categories, rules }: { onClose: () => void; categories: string[]; rules: FinanceCategoryRule[] }) {
  const [category, setCategory] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [note, setNote] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  function onNoteChange(value: string) {
    setNote(value);
    // Auto-suggest a category from what the item is called (e.g. "Bike oil
    // change" → "Travel"), unless the person has already picked one by hand.
    if (!categoryTouched) {
      const match = matchCategoryForLabel(value, rules);
      if (match) setCategory(match);
    }
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>Add expense</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          Income isn&apos;t added here — it posts on its own from a project payment, bounty payout, salary, or a due
          being settled.
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
            <label className="field-label" htmlFor="note">What&apos;s it for?</label>
            <input id="note" name="note" type="text" placeholder="e.g. Bike oil change" style={{ width: '100%' }}
              value={note} onChange={(e) => onNoteChange(e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="category">Category</label>
            <input id="category" name="category" list="df-category-options-expense" required style={{ width: '100%' }}
              placeholder="Pick one or type a new label"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setCategoryTouched(true); }} />
            <datalist id="df-category-options-expense">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p className="text-muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
              Type any label — new ones are saved for next time.{' '}
              <button type="button" className="link-btn" style={{ fontSize: 11.5 }} onClick={() => setRulesOpen((v) => !v)}>
                {rulesOpen ? 'Hide' : 'Manage'} matching rules
              </button>
            </p>
          </div>
          {rulesOpen && <CategoryRulesManager rules={rules} categories={categories} />}
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Add expense</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "When the item's name contains X, file it under category Y" — e.g.
 *  "bike" → "Travel", so a bike oil change or a bike wash both roll up
 *  under Travel without picking the category by hand every time. */
function CategoryRulesManager({ rules, categories }: { rules: FinanceCategoryRule[]; categories: string[] }) {
  return (
    <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2, rgba(0,0,0,.03))', borderRadius: 8 }}>
      {rules.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rules.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
              <span>&ldquo;{r.keyword}&rdquo; → {r.category}</span>
              <button type="button" className="df-del" title="Remove rule" onClick={() => void deleteCategoryRule(r.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      <form action={async (fd) => { await addCategoryRule(fd); }} style={{ display: 'flex', gap: 6 }}>
        <input name="keyword" type="text" placeholder="e.g. bike" required style={{ flex: 1, fontSize: 12.5 }} />
        <span style={{ fontSize: 12.5, alignSelf: 'center' }}>→</span>
        <input name="category" type="text" list="df-category-options-expense" placeholder="e.g. Travel" required style={{ flex: 1, fontSize: 12.5 }} />
        <button type="submit" className="btn-ghost" style={{ fontSize: 12 }}>Add</button>
      </form>
    </div>
  );
}

function AddSalaryModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>Add salary</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          The one other manual income entry — a job pay day has no invoice or bounty to hang off of.
        </p>
        <form action={async (fd) => { await logSalary(fd); onClose(); }}>
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="s-date">Date</label>
              <input id="s-date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="s-amount">Amount received</label>
              <input id="s-amount" name="amount" type="number" min={0.01} step="0.01" required placeholder="Net, after TDS" style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="s-tds">TDS deducted (optional)</label>
            <input id="s-tds" name="tds" type="number" min={0} step="0.01" placeholder="0" style={{ width: '100%' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="s-note">Note</label>
            <input id="s-note" name="note" type="text" placeholder="e.g. September salary" style={{ width: '100%' }} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Add salary</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AddObligationModal({ onClose, categories }: { onClose: () => void; categories: string[] }) {
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>Add a due</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          A college fee, a loan you&apos;re clearing, paying a friend back, or a friend owing you. Say how much and by
          when — then add each payment as you make it, and the balance and status update on their own.
        </p>
        <form action={async (fd) => { await createObligation(fd); onClose(); }}>
          <div style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="o-label">Whom / what for</label>
            <input id="o-label" name="label" type="text" required placeholder="e.g. College fee, or Ramesh" style={{ width: '100%' }} />
          </div>
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="o-direction">Direction</label>
              <select id="o-direction" name="direction" required defaultValue="payable" style={{ width: '100%' }}>
                <option value="payable">I need to give (payable)</option>
                <option value="receivable">Someone owes me (receivable)</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="o-cadence">Repeats</label>
              <select id="o-cadence" name="cadence" required defaultValue="monthly" style={{ width: '100%' }}>
                <option value="monthly">Every month</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
          </div>
          <div className="grid-2-eq" style={{ marginTop: 12 }}>
            <div>
              <label className="field-label" htmlFor="o-amount">Amount to pay</label>
              <input id="o-amount" name="default_amount" type="number" min={0.01} step="0.01" required placeholder="5000" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="o-due">Due date</label>
              <input id="o-due" name="due_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ width: '100%' }} />
              <p className="text-muted" style={{ fontSize: 11, margin: '3px 0 0' }}>For monthly dues, this day repeats every month.</p>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="o-category">Category</label>
            <input id="o-category" name="category" list="df-category-options-due" required placeholder="e.g. Education" style={{ width: '100%' }} />
            <datalist id="df-category-options-due">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="o-note">Note</label>
            <input id="o-note" name="note" type="text" placeholder="Optional" style={{ width: '100%' }} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Add due</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettleObligationModal({ view, onClose, money }: { view: ObligationView; onClose: () => void; money: (n: number) => string }) {
  const { obligation } = view;
  const payable = obligation.direction === 'payable';
  const suggested = view.balance !== null ? view.balance : obligation.default_amount ?? undefined;
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{payable ? 'Add payment' : 'Add received amount'} · {obligation.label}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        {view.need !== null && (
          <div className="df-settle-sum">
            <div><span>Need to pay</span><b>{money(view.need)}</b></div>
            <div><span>{payable ? 'Paid so far' : 'Received so far'}</span><b>{money(view.paid)}</b></div>
            <div><span>Balance</span><b>{money(view.balance ?? 0)}</b></div>
          </div>
        )}
        <p className="text-muted text-sm" style={{ margin: '0 0 16px' }}>
          This posts a real {payable ? 'expense' : 'income'} entry to the ledger under &ldquo;{obligation.category}&rdquo;.
          Pay part now and the rest later — the due stays open until the balance reaches zero.
        </p>
        <form
          action={async (fd) => { fd.set('obligation_id', obligation.id); await settleObligation(fd); onClose(); }}
        >
          <div className="grid-2-eq">
            <div>
              <label className="field-label" htmlFor="d-date">Date</label>
              <input id="d-date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="d-amount">Amount {payable ? 'paid' : 'received'}</label>
              <input id="d-amount" name="amount" type="number" min={0.01} step="0.01" required
                defaultValue={suggested} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="d-note">Note</label>
            <input id="d-note" name="note" type="text" placeholder={obligation.label} style={{ width: '100%' }} />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">{payable ? 'Add payment' : 'Add received amount'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
