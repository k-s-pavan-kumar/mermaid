'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { InvestmentLogEntry } from '../types';
import { addInvestment, deleteInvestment } from '../actions';
import { ActionButton } from '@/components/ActionButton';
import { SubmitButton } from '@/components/SubmitButton';
import { toast } from '@/lib/toast';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function shortDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** A plain hand-kept list: S.no · Amount invested · Invested in · Date. */
export function InvestmentsPageClient({
  entries, currency, today,
}: { entries: InvestmentLogEntry[]; currency: string; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const money = (n: number) => fmt(n, currency);
  const total = entries.reduce((n, e) => n + e.amount, 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 13, maxWidth: 520 }}>
          Add each investment yourself. This list is separate from your invoices and ledger — nothing is pulled in from anywhere.
        </p>
        <Link href="/daily-finance" className="link-btn" style={{ fontSize: 12 }}>← Daily Finance</Link>
      </div>

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
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div>
              <label className="field-label" htmlFor="inv-amt">Amount invested</label>
              <input id="inv-amt" name="amount" type="number" min={0.01} step="0.01" required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="inv-in">Invested in</label>
              <input id="inv-in" name="invested_in" type="text" required placeholder="e.g. Nifty 50 index fund" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label" htmlFor="inv-date">Date</label>
              <input id="inv-date" name="date" type="date" required defaultValue={today} style={{ width: '100%' }} />
            </div>
            <div><SubmitButton className="btn">Add</SubmitButton></div>
          </div>
          {error && <p style={{ color: 'var(--crimson)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
        </form>
      </div>

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
                  <th className="num">Amount invested</th>
                  <th>Invested in</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td className="num">{money(e.amount)}</td>
                    <td>{e.invested_in}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{shortDay(e.date)}</td>
                    <td className="df-due-actions">
                      <ActionButton className="df-del" title="Delete" confirm="Delete this entry?" action={() => deleteInvestment(e.id)}>×</ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(total)}</td>
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
