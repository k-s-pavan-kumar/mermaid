import type { TargetSummary } from '../compute';

export const inr0 = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Money received each month (bars), the running total (line) and the straight-
 * line plan to the target (dashed). Everything draws itself in on load; with
 * "reduce motion" on it simply appears.
 */
export function ProgressChart({ s, label }: { s: TargetSummary; label: string }) {
  const W = 640, H = 210, L = 44, R = 10, T = 12, B = 24;
  const cum = s.cumulative.filter((v): v is number => v !== null);
  const top = Math.max(s.target, ...cum, ...s.monthly, 1);
  const band = (W - L - R) / 12;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const cx = (i: number) => L + band * i + band / 2;
  const linePts = s.cumulative.map((v, i) => (v === null ? null : `${cx(i)},${y(v)}`)).filter(Boolean).join(' ');
  const paceD = s.pace.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${y(v)}`).join(' ');
  const ticks = [0, 0.5, 1].map((f) => top * f);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
           aria-label={`${label}: received each month, running total and plan to target`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border-light)" />
            <text x={L - 6} y={y(t) + 3} fontSize="9.5" textAnchor="end" fill="var(--muted)">{t >= 100000 ? `${(t / 100000).toFixed(t % 100000 ? 1 : 0)}L` : t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}</text>
          </g>
        ))}
        {s.monthly.map((v, i) => v > 0 && (
          <rect key={i} className="anim-bar" style={{ ['--i' as string]: i }} x={cx(i) - band * 0.28} width={band * 0.56}
                y={y(v)} height={Math.max(1, y(0) - y(v))} rx={2} fill="var(--pine)" opacity={0.28}>
            <title>{`${MONTH_FULL[i]}: ${inr0(v)}`}</title>
          </rect>
        ))}
        {s.target > 0 && <path d={paceD} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" className="anim-fade" />}
        {linePts && (
          <>
            <polyline points={linePts} pathLength={1} fill="none" stroke="var(--sage)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="anim-line" />
            {s.cumulative.map((v, i) => v !== null && (i === s.cumulative.findLastIndex((x) => x !== null)) && (
              <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill="var(--sage)" className="anim-fade"><title>{`Received so far: ${inr0(v)}`}</title></circle>
            ))}
          </>
        )}
        {MONTHS.map((m, i) => <text key={i} x={cx(i)} y={H - 7} fontSize="10" textAnchor="middle" fill="var(--muted)">{m}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, marginTop: 4 }} className="text-muted">
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--pine)', opacity: 0.35, borderRadius: 2, marginRight: 5 }} />Received that month</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--sage)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />Running total</span>
        {s.target > 0 && <span><span style={{ display: 'inline-block', width: 12, borderTop: '2px dashed var(--muted)', marginRight: 5, verticalAlign: 'middle' }} />Plan to target</span>}
      </div>
    </div>
  );
}

/** One ring: how much of the target is reached. */
export function Donut({ pct, centre, sub }: { pct: number; centre: string; sub: string }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: 150, height: 150 }} role="img" aria-label={`${centre} ${sub}`}>
      <circle cx="20" cy="20" r="15.9155" fill="none" stroke="var(--border-light)" strokeWidth="4.5" />
      <circle cx="20" cy="20" r="15.9155" fill="none" stroke="var(--sage)" strokeWidth="4.5" strokeLinecap="butt" pathLength={100}
              strokeDasharray={`${Math.max(0, Math.min(100, pct))} ${100 - Math.max(0, Math.min(100, pct))}`}
              transform="rotate(-90 20 20)" className="anim-sweep" />
      <text x="20" y="21" textAnchor="middle" fontSize="7" fontWeight="600" fill="currentColor" style={{ fontFamily: "'Fraunces',serif" }}>{centre}</text>
      <text x="20" y="26.5" textAnchor="middle" fontSize="3.2" fill="var(--muted)">{sub}</text>
    </svg>
  );
}

/** Pie: each field's share of everything received so far. */
export function SharePie({ slices }: { slices: { name: string; color: string; value: number }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return <div className="text-muted" style={{ fontSize: 12.5, width: 150, textAlign: 'center' }}>Nothing received yet this year.</div>;
  }
  let start = 0;
  return (
    <svg viewBox="0 0 32 32" style={{ width: 150, height: 150 }} role="img" aria-label="Share of money received, by field">
      {slices.filter((s) => s.value > 0).map((s) => {
        const share = (s.value / total) * 100;
        const el = (
          <circle key={s.name} cx="16" cy="16" r="8" fill="none" stroke={s.color} strokeWidth="16" pathLength={100}
                  strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 16 16)" className="anim-sweep">
            <title>{`${s.name}: ${inr0(s.value)} (${Math.round(share)}%)`}</title>
          </circle>
        );
        start += share;
        return el;
      })}
    </svg>
  );
}
