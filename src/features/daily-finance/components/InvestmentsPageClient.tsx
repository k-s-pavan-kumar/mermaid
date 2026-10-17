'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InvestmentLogEntry } from '../types';
import { addInvestment, changeInvestmentCategory, deleteInvestment } from '../actions';
import {
  PRESET_CATEGORIES, categoryColor, categoryLabel, cumulativeSeries, entryCategory, runningByCategory, totalsByCategory,
} from '../investment-categories';
import { ActionButton } from '@/components/ActionButton';
import { SubmitButton } from '@/components/SubmitButton';
import { toast } from '@/lib/toast';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function shortDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Cumulative invested amount per category over time — one step-line each. */
function CumulativeChart({ entries, money }: { entries: InvestmentLogEntry[]; money: (n: number) => string }) {
  const series = useMemo(() => cumulativeSeries(entries), [entries]);
  const W = 640, H = 190, L = 8, R = 8, T = 10, B = 20;
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const t = (d: string) => new Date(d + 'T00:00:00Z').getTime();
  const minT = Math.min(...all.map((p) => t(p.date)));
  const maxT = Math.max(...all.map((p) => t(p.date)));
  const maxV = Math.max(...all.map((p) => p.value));
  const x = (d: string) => (maxT === minT ? (L + W - R) / 2 : L + ((t(d) - minT) / (maxT - minT)) * (W - L - R));
  const y = (v: number) => T + (1 - v / maxV) * (H - T - B);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="df-panel-head"><span>Cumulative by category</span></div>
      <div style={{ padding: '10px 16px 14px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
             aria-label="Cumulative amount invested in each category over time">
          <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--border)" />
          {series.map((s) => {
            // Step line: the total stays flat until the next purchase in that category.
            let d = '';
            s.points.forEach((p, i) => {
              const px = x(p.date), py = y(p.value);
              d += i === 0 ? `M${px},${y(0)} L${px},${py}` : ` H${px} V${py}`;
            });
            const last = s.points[s.points.length - 1]!;
            d += ` H${W - R}`;
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round">
                  <title>{`${s.label}: ${money(last.value)}`}</title>
                </path>
                {s.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3} fill={s.color} />)}
              </g>
            );
          })}
          <text x={L} y={H - 5} fontSize="10" fill="var(--muted)">{shortDay(new Date(minT).toISOString().slice(0, 10))}</text>
          <text x={W - R} y={H - 5} fontSize="10" fill="var(--muted)" textAnchor="end">{shortDay(new Date(maxT).toISOString().slice(0, 10))}</text>
          <text x={W - R} y={T + 8} fontSize="10" fill="var(--muted)" textAnchor="end">{money(maxV)}</text>
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12 }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 3, background: s.color, borderRadius: 2, display: 'inline-block' }} />{s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Inline category switcher for one row. */
function CategoryCell({ entry, extra }: { entry: InvestmentLogEntry; extra: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = entryCategory(entry);
  const options = [...PRESET_CATEGORIES.map((c) => c.key), ...extra.filter((k) => !PRESET_CATEGORIES.some((c) => c.key === k))];
  return (
    <select
      value={current}
      disabled={pending}
      aria-label={`Category for ${entry.invested_in}`}
      onChange={(e) => start(async () => { await changeInvestmentCategory(entry.id, e.target.value); router.refresh(); })}
      style={{ padding: '2px 6px', fontSize: 12, borderLeft: `3px solid ${categoryColor(current)}` }}
    >
      {options.map((k) => <option key={k} value={k}>{categoryLabel(k)}</option>)}
    </select>
  );
}

/**
 * Hand-kept investment list: S.no · Category · Invested in · Amount · Date.
 * Entries roll up into a total per category (gold, silver, stocks, …) with a
 * running figure per category on every row, and the cards filter the list.
 */
export function InvestmentsPageClient({
  entries, currency, today,
}: { entries: InvestmentLogEntry[]; currency: string; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [cat, setCat] = useState('stocks');
  const formRef = useRef<HTMLFormElement>(null);
  const money = (n: number) => fmt(n, currency);

  const totals = useMemo(() => totalsByCategory(entries), [entries]);
  const running = useMemo(() => runningByCategory(entries), [entries]);
  const grand = entries.reduce((n, e) => n + e.amount, 0);
  const customKeys = totals.map((c) => c.key);
  const activeFilter = filter && totals.some((c) => c.key === filter) ? filter : null;
  const shown = activeFilter ? entries.filter((e) => entryCategory(e) === activeFilter) : entries;
  const shownTotal = shown.reduce((n, e) => n + e.amount, 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 13, maxWidth: 560 }}>
          Add each investment yourself — stocks, gold, silver, funds, FDs or anything else. This list is separate from your invoices and ledger — nothing is pulled in from anywhere.
        </p>
        <Link href="/daily-finance" className="link-btn" style={{ fontSize: 12 }}>← Daily Finance</Link>
      </div>

      {entries.length > 0 && (
        <div className="inv-cat-grid">
          <button type="button" className={`inv-cat${activeFilter === null ? ' on' : ''}`} onClick={() => setFilter(null)}>
            <div className="lbl">All investments</div>
            <div className="val">{money(grand)}</div>
            <div className="sub">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</div>
          </button>
          {totals.map((c) => (
            <button key={c.key} type="button" className={`inv-cat${activeFilter === c.key ? ' on' : ''}`}
                    onClick={() => setFilter(activeFilter === c.key ? null : c.key)}>
              <div className="lbl"><span className="type-dot" style={{ background: c.color, margin: 0 }} />{c.label}</div>
              <div className="val">{money(c.total)}</div>
              <div className="sub">{c.share}% · {c.count} entr{c.count === 1 ? 'y' : 'ies'}</div>
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="df-panel-head"><span>Add investment</span></div>
        <form
          ref={formRef}
          style={{ padding: '14px 16px' }}
          action={async (fd) => {
            const res = await addInvestment(fd);
            if (!res.ok) { setError(res.message); return; }
            setError(null);
            toast(res.message);
            formRef.current?.reset();
            setCat('stocks');
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div>
              <label className="field-label" htmlFor="inv-cat">Category</label>
              <select id="inv-cat" name="category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: '100%' }}>
                {PRESET_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                {customKeys.filter((k) => !PRESET_CATEGORIES.some((c) => c.key === k)).map((k) => <option key={k} value={k}>{categoryLabel(k)}</option>)}
                <option value="__custom__">New category…</option>
              </select>
            </div>
            {cat === '__custom__' && (
              <div>
                <label className="field-label" htmlFor="inv-custom">Category name</label>
                <input id="inv-custom" name="custom_category" type="text" required maxLength={30} placeholder="e.g. Art, Startup" style={{ width: '100%' }} />
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="inv-amt">Amount invested</label>
              <input id="inv-amt" name="amount" type="number" min={0.01} step="0.01" required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="inv-in">Invested in <span className="text-muted">(optional)</span></label>
              <input id="inv-in" name="invested_in" type="text" placeholder={cat === 'gold' ? 'e.g. Sovereign Gold Bond' : cat === 'silver' ? 'e.g. Silver coin 50g' : 'e.g. Nifty 50 index fund'} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="inv-date">Date</label>
              <input id="inv-date" name="date" type="date" required defaultValue={today} style={{ width: '100%' }} />
            </div>
            <div><SubmitButton className="btn" pendingLabel="Adding…">Add</SubmitButton></div>
          </div>
          {error && <p style={{ color: 'var(--crimson)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
        </form>
      </div>

      <CumulativeChart entries={entries} money={money} />

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty">
            <img src="/mascot/idle.png" alt="" width={72} height={72} />
            <div className="big">Nothing added yet</div>
            Add this month&apos;s investment above and it will appear here.
          </div>
        ) : (
          <div className="df-scroll">
            <table className="df-dues">
              <thead>
                <tr>
                  <th>S.no</th>
                  <th>Category</th>
                  <th>Invested in</th>
                  <th className="num">Amount</th>
                  <th className="num" title="Total invested in this category up to and including this row">Category total</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    {/* S.no is the entry's place in the full list, so it doesn't shift when filtering. */}
                    <td>{entries.indexOf(e) + 1}</td>
                    <td><CategoryCell entry={e} extra={customKeys} /></td>
                    <td>{e.invested_in}</td>
                    <td className="num">{money(e.amount)}</td>
                    <td className="num text-muted">{money(running.get(e.id) ?? e.amount)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{shortDay(e.date)}</td>
                    <td className="df-due-actions">
                      <ActionButton className="df-del" title="Delete" confirm="Delete this entry?" action={() => deleteInvestment(e.id)}>×</ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 600 }} colSpan={3}>{activeFilter ? `${categoryLabel(activeFilter)} total` : 'Total'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(shownTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
