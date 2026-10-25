import { ProgressChart, inr0 } from './charts';
import { pipeline } from '../compute';
import type { fieldView } from '../view';

type View = ReturnType<typeof fieldView>;

const fmtHours = (m: number) => `${(m / 60).toLocaleString('en-IN', { maximumFractionDigits: 1 })} h`;

/**
 * The cards at the top of every field page — goal, reached, pending,
 * outstanding — then a row of insights (forecast, recurring, profit, time) and
 * the month-by-month chart. "Reached" is money actually received, so these move
 * on their own as invoices get paid.
 */
export function FieldTargetCards({ name, year, view }: { name: string; year: number; view: View }) {
  const s = view.summary;
  if (view.target <= 0) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16 }}>No {year} amount target for {name} yet</div>
        <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Set one in <a href={`/goals?year=${year}#targets`}>Goals → Yearly amount targets</a> and this page will show how much you have reached and what is still pending.
        </p>
      </div>
    );
  }
  const ahead = s.gap >= 0;
  const pipe = pipeline(s.pending, view.outstanding);
  const over = Math.max(0, s.reached - s.target);
  const fc = view.forecast;
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="stat-row">
        <div className="stat-box"><div className="lbl">{year} goal</div><div className="val">{inr0(s.target)}</div></div>
        <div className="stat-box">
          <div className="lbl">Reached · received</div>
          <div className="val" style={{ color: 'var(--sage)' }}>{inr0(s.reached)}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>{over > 0 ? `${inr0(over)} over the goal` : `${s.pct}% of goal`}</div>
        </div>
        <div className="stat-box">
          <div className="lbl">Pending · still to earn</div>
          <div className="val" style={{ color: s.pending > 0 ? 'var(--crimson)' : 'var(--sage)' }}>{inr0(s.pending)}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>{s.pending === 0 ? 'Goal reached ✓' : s.neededPerMonth ? `≈ ${inr0(s.neededPerMonth)} / month to finish` : 'Year is over'}</div>
        </div>
        <div className="stat-box">
          <div className="lbl">Outstanding · invoiced, unpaid</div>
          <div className="val" style={{ color: view.outstanding > 0 ? 'var(--gold, #D99A18)' : undefined }}>{inr0(view.outstanding)}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            {s.pending === 0 ? 'Waiting for payment' : pipe.covered ? 'Covers the pending amount ✓' : `Still to invoice ${inr0(pipe.stillToInvoice)}`}
          </div>
        </div>
      </div>

      <div className="insight-row">
        {fc && fc.basis === 'run-rate' && (
          <div className="insight" title="Your pace so far, carried to December. A projection, not a promise.">
            <span className="k">Year-end forecast</span>
            <strong style={{ color: fc.onPace ? 'var(--sage)' : 'var(--crimson)' }}>{inr0(fc.projected)}</strong>
            <span className="text-muted">{fc.onPace ? 'on pace for the goal' : `${inr0(fc.shortBy)} short at this pace`}</span>
          </div>
        )}
        {view.recurringTotal > 0 && (
          <div className="insight" title="Average of the last three months of retainer / subscription payments.">
            <span className="k">Recurring</span><strong>{inr0(view.mrr)}<small>/month</small></strong>
            <span className="text-muted">{inr0(view.recurringTotal)} this year</span>
          </div>
        )}
        {view.profit.costs > 0 && (
          <div className="insight">
            <span className="k">Profit</span>
            <strong style={{ color: view.profit.profit >= 0 ? 'var(--sage)' : 'var(--crimson)' }}>{inr0(view.profit.profit)}</strong>
            <span className="text-muted">after {inr0(view.profit.costs)} costs{view.profit.marginPct !== null ? ` · ${view.profit.marginPct}% margin` : ''}</span>
          </div>
        )}
        {view.minutes > 0 && (
          <div className="insight">
            <span className="k">Time</span><strong>{fmtHours(view.minutes)}</strong>
            <span className="text-muted">{view.rate ? `≈ ${inr0(view.rate)} per hour` : 'no income to rate yet'}</span>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Received by month</strong>
          <span style={{ fontSize: 12.5, color: ahead ? 'var(--sage)' : 'var(--crimson)' }}>
            {s.expectedToDate > 0 ? (ahead ? `${inr0(s.gap)} ahead of plan` : `${inr0(-s.gap)} behind plan`) : ''}
          </span>
        </div>
        <ProgressChart s={s} label={`${name} ${year}`} recurring={view.recurringMonthly} />
      </div>
    </div>
  );
}
