import { ProgressChart, inr0 } from './charts';
import type { TargetSummary } from '../compute';

/**
 * The three cards at the top of every field page — yearly goal, reached,
 * pending — plus the month-by-month chart. "Reached" is money actually
 * received (see compute.ts), so these move on their own as invoices get paid.
 */
export function FieldTargetCards({ name, year, s }: { name: string; year: number; s: TargetSummary | null }) {
  if (!s || s.target <= 0) {
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
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="stat-row">
        <div className="stat-box"><div className="lbl">{year} goal</div><div className="val">{inr0(s.target)}</div></div>
        <div className="stat-box"><div className="lbl">Reached</div><div className="val" style={{ color: 'var(--sage)' }}>{inr0(s.reached)}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{s.pct}% of goal</div></div>
        <div className="stat-box"><div className="lbl">Pending</div><div className="val" style={{ color: s.pending > 0 ? 'var(--crimson)' : 'var(--sage)' }}>{inr0(s.pending)}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>{s.pending === 0 ? 'Goal reached' : s.neededPerMonth ? `≈ ${inr0(s.neededPerMonth)} / month to finish` : 'Year is over'}</div></div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Received by month</strong>
          <span style={{ fontSize: 12.5, color: ahead ? 'var(--sage)' : 'var(--crimson)' }}>
            {s.expectedToDate > 0 ? (ahead ? `${inr0(s.gap)} ahead of plan` : `${inr0(-s.gap)} behind plan`) : ''}
          </span>
        </div>
        <ProgressChart s={s} label={`${name} ${year}`} />
      </div>
    </div>
  );
}
