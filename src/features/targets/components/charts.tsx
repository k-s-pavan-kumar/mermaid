import type { TargetSummary } from '../compute';

export const inr0 = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const compact = (n: number) => (n >= 100000 ? `${+(n / 100000).toFixed(1)}L` : n >= 1000 ? `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A nice round top for an axis, so ticks read as 0 / 25k / 50k rather than 0 / 23,417. */
function niceTop(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const f = v / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Compact monthly chart. Two scales on purpose:
 *   bars  (left axis)  — what landed each month, scaled to the biggest month,
 *                        so a ₹20k month is clearly visible next to a ₹3L goal;
 *   line  (right axis) — running total, with the straight-line plan to target.
 * Each bar is labelled with its amount. Capped in width so it stays a small,
 * glanceable strip however wide the page is.
 */
export function ProgressChart({ s, label, recurring }: { s: TargetSummary; label: string; recurring?: number[] }) {
  const W = 720, H = 168, L = 40, R = 44, T = 16, B = 20;
  const cum = s.cumulative.filter((v): v is number => v !== null);
  const barTop = niceTop(Math.max(...s.monthly, 1));
  const lineTop = niceTop(Math.max(s.target, ...cum, 1));
  const band = (W - L - R) / 12;
  const cx = (i: number) => L + band * i + band / 2;
  const yBar = (v: number) => T + (1 - v / barTop) * (H - T - B);
  const yLine = (v: number) => T + (1 - v / lineTop) * (H - T - B);
  const linePts = s.cumulative.map((v, i) => (v === null ? null : `${cx(i)},${yLine(v)}`)).filter(Boolean).join(' ');
  const paceD = s.pace.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${yLine(v)}`).join(' ');
  const lastIdx = s.cumulative.reduce<number>((acc, v, i) => (v === null ? acc : i), -1);

  return (
    <div style={{ maxWidth: 760 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
           aria-label={`${label}: received each month, running total and plan to target`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={yBar(barTop * f)} y2={yBar(barTop * f)} stroke="var(--border-light)" />
            <text x={L - 5} y={yBar(barTop * f) + 3} fontSize="9" textAnchor="end" fill="var(--pine)">{compact(barTop * f)}</text>
            <text x={W - R + 5} y={yLine(lineTop * f) + 3} fontSize="9" textAnchor="start" fill="var(--sage)">{compact(lineTop * f)}</text>
          </g>
        ))}
        {s.monthly.map((v, i) => v > 0 && (
          <g key={i}>
            <rect className="anim-bar" style={{ ['--i' as string]: i }} x={cx(i) - band * 0.3} width={band * 0.6}
                  y={yBar(v)} height={Math.max(1.5, yBar(0) - yBar(v))} rx={2} fill="var(--pine)" opacity={0.32}>
              <title>{`${MONTH_FULL[i]}: ${inr0(v)}`}</title>
            </rect>
            {recurring && (recurring[i] ?? 0) > 0 && (
              <rect className="anim-bar" style={{ ['--i' as string]: i }} x={cx(i) - band * 0.3} width={band * 0.6}
                    y={yBar(Math.min(v, recurring[i]!))} height={Math.max(1.5, yBar(0) - yBar(Math.min(v, recurring[i]!)))} rx={2} fill="var(--pine)" opacity={0.7}>
                <title>{`${MONTH_FULL[i]}: ${inr0(recurring[i]!)} recurring`}</title>
              </rect>
            )}
            <text className="anim-fade" x={cx(i)} y={yBar(v) - 3} fontSize="8.5" textAnchor="middle" fill="var(--pine)" fontWeight="600">{compact(v)}</text>
          </g>
        ))}
        {s.target > 0 && <path d={paceD} fill="none" stroke="var(--muted)" strokeWidth={1.3} strokeDasharray="4 4" className="anim-fade" />}
        {linePts && (
          <>
            <polyline points={linePts} pathLength={1} fill="none" stroke="var(--sage)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="anim-line" />
            {lastIdx >= 0 && (
              <circle cx={cx(lastIdx)} cy={yLine(s.cumulative[lastIdx] as number)} r={3.5} fill="var(--sage)" className="anim-fade">
                <title>{`Received so far: ${inr0(s.cumulative[lastIdx] as number)}`}</title>
              </circle>
            )}
          </>
        )}
        {MONTHS.map((m, i) => <text key={i} x={cx(i)} y={H - 6} fontSize="9.5" textAnchor="middle" fill="var(--muted)">{m}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, marginTop: 2 }} className="text-muted">
        <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'var(--pine)', opacity: 0.4, borderRadius: 2, marginRight: 4 }} />Received that month (left scale)</span>
        {recurring && recurring.some((x) => x > 0) && <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'var(--pine)', opacity: 0.75, borderRadius: 2, marginRight: 4 }} />of which recurring</span>}
        <span><span style={{ display: 'inline-block', width: 11, height: 3, background: 'var(--sage)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Running total (right scale)</span>
        {s.target > 0 && <span><span style={{ display: 'inline-block', width: 11, borderTop: '2px dashed var(--muted)', marginRight: 4, verticalAlign: 'middle' }} />Plan to target</span>}
      </div>
    </div>
  );
}

/** One ring: how much of the target is reached. */
export function Donut({ pct, centre, sub }: { pct: number; centre: string; sub: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 40 40" style={{ width: 130, height: 130 }} role="img" aria-label={`${centre} ${sub}`}>
      <circle cx="20" cy="20" r="15.9155" fill="none" stroke="var(--border-light)" strokeWidth="4.5" />
      <circle cx="20" cy="20" r="15.9155" fill="none" stroke="var(--sage)" strokeWidth="4.5" strokeLinecap="butt" pathLength={100}
              strokeDasharray={`${p} ${100 - p}`} transform="rotate(-90 20 20)" className="anim-sweep" />
      <text x="20" y="21" textAnchor="middle" fontSize="7" fontWeight="600" fill="currentColor" style={{ fontFamily: "'Fraunces',serif" }}>{centre}</text>
      <text x="20" y="26.5" textAnchor="middle" fontSize="3.2" fill="var(--muted)">{sub}</text>
    </svg>
  );
}

/** Pie slice as a real arc path from 12 o'clock — no dash tricks, so it draws the same in every browser. */
export function pieSlicePath(startPct: number, sharePct: number, r = 16, c = 16): string {
  const a0 = (startPct / 100) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((startPct + sharePct) / 100) * 2 * Math.PI - Math.PI / 2;
  const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
  const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
  const large = sharePct > 50 ? 1 : 0;
  return `M${c},${c} L${x0.toFixed(3)},${y0.toFixed(3)} A${r},${r} 0 ${large} 1 ${x1.toFixed(3)},${y1.toFixed(3)} Z`;
}

/** Pie: each field's share of everything received so far. */
export function SharePie({ slices }: { slices: { name: string; color: string; value: number }[] }) {
  const live = slices.filter((s) => s.value > 0);
  const total = live.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return <div className="text-muted" style={{ fontSize: 12.5, width: 130, height: 130, display: 'grid', placeItems: 'center', textAlign: 'center' }}>Nothing received yet this year.</div>;
  }
  let start = 0;
  return (
    <svg viewBox="0 0 32 32" style={{ width: 130, height: 130 }} role="img" aria-label="Share of money received, by field">
      {live.map((s, i) => {
        const share = (s.value / total) * 100;
        const title = <title>{`${s.name}: ${inr0(s.value)} (${Math.round(share)}%)`}</title>;
        const el = live.length === 1
          ? <circle key={s.name} cx="16" cy="16" r="16" fill={s.color} className="anim-pop" style={{ ['--i' as string]: i }}>{title}</circle>
          : <path key={s.name} d={pieSlicePath(start, share)} fill={s.color} stroke="var(--surface, #fff)" strokeWidth="0.4" className="anim-pop" style={{ ['--i' as string]: i }}>{title}</path>;
        start += share;
        return el;
      })}
    </svg>
  );
}
