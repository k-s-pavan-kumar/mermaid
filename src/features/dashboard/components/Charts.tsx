'use client';

/**
 * Charts drawn as plain SVG.
 *
 * There is no charting library in this project's dependencies and adding one
 * to draw two shapes would be a poor trade — a donut is an arc and a stacked
 * bar is a row of divs. Everything below takes colours as CSS custom
 * properties (var(--pine) and friends) so the charts inherit the palette
 * rather than hard-coding a second one.
 */

export interface Slice {
  key: string;
  label: string;
  color: string;
  value: number;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** An annular sector — the donut's building block. */
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, from: number, to: number): string {
  // A full circle can't be drawn as a single arc (start and end coincide),
  // so nudge it just shy of 360°.
  const end = to - from >= 360 ? from + 359.999 : to;
  const [x1, y1] = polar(cx, cy, rOuter, from);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, from);
  const large = end - from > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export function Donut({
  slices,
  size = 200,
  thickness = 34,
  centerTop,
  centerBottom,
  onHover,
  activeKey,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
  onHover?: (key: string | null) => void;
  activeKey?: string | null;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="No data yet">
        <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="var(--border)" strokeWidth={thickness} />
      </svg>
    );
  }

  let cursor = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={slices.map((s) => `${s.label}: ${Math.round((s.value / total) * 100)}%`).join(', ')}
      onMouseLeave={() => onHover?.(null)}
    >
      {slices.map((s) => {
        const sweep = (s.value / total) * 360;
        const from = cursor;
        cursor += sweep;
        if (sweep <= 0) return null;
        const dim = activeKey != null && activeKey !== s.key;
        return (
          <path
            key={s.key}
            d={arcPath(cx, cy, rOuter, rInner, from, from + sweep)}
            fill={s.color}
            opacity={dim ? 0.3 : 1}
            stroke="var(--surface)"
            strokeWidth={1.5}
            onMouseEnter={() => onHover?.(s.key)}
            style={{ transition: 'opacity .15s' }}
          >
            <title>{`${s.label} — ${Math.round((s.value / total) * 100)}%`}</title>
          </path>
        );
      })}
      {centerTop && (
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center-top">
          {centerTop}
        </text>
      )}
      {centerBottom && (
        <text x={cx} y={cy + 15} textAnchor="middle" className="donut-center-bottom">
          {centerBottom}
        </text>
      )}
    </svg>
  );
}

/**
 * A horizontal stacked bar. Used for the month-wise spread, one bar per
 * month, so twelve months stack into something readable on a phone —
 * twelve vertical columns would not be.
 */
export function StackedBar({
  slices,
  total,
  activeKey,
  onHover,
}: {
  slices: Slice[];
  /** Denominator. Passing a shared maximum across bars is what makes a busy
   *  month look busier than a quiet one, rather than every bar being full. */
  total: number;
  activeKey?: string | null;
  onHover?: (key: string | null) => void;
}) {
  if (total <= 0) return <div className="sbar empty" />;

  return (
    <div className="sbar" onMouseLeave={() => onHover?.(null)}>
      {slices.map((s) => {
        const pct = (s.value / total) * 100;
        if (pct <= 0) return null;
        return (
          <span
            key={s.key}
            className="sbar-seg"
            title={`${s.label} — ${Math.round(s.value / 60)}h`}
            style={{
              width: `${pct}%`,
              background: s.color,
              opacity: activeKey != null && activeKey !== s.key ? 0.3 : 1,
            }}
            onMouseEnter={() => onHover?.(s.key)}
          />
        );
      })}
    </div>
  );
}

/**
 * A target bar.
 *
 * `pace` is where you'd be if you were exactly on schedule for the period —
 * drawn as a notch, because "62% of the way to the target" means something
 * very different in week one than in week four, and a bare percentage hides
 * that entirely.
 */
export function TargetBar({
  label,
  value,
  target,
  unit = '',
  pace,
  format,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  pace?: number;
  format?: (n: number) => string;
}) {
  const fmt = format ?? ((n: number) => `${Math.round(n * 10) / 10}${unit}`);
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const pacePct = pace != null ? Math.min(100, Math.max(0, pace * 100)) : null;
  const ahead = pacePct == null || pct >= pacePct;
  const hit = target > 0 && value >= target;

  return (
    <div className="target-row">
      <div className="target-head">
        <span className="target-label">{label}</span>
        <span className={`target-val${hit ? ' hit' : ''}`}>
          {fmt(value)} <span className="target-of">of {fmt(target)}</span>
        </span>
      </div>
      <div className="target-track">
        <span
          className={`target-fill${hit ? ' hit' : ahead ? '' : ' behind'}`}
          style={{ width: `${pct}%` }}
        />
        {pacePct != null && pacePct > 0 && pacePct < 100 && (
          <span className="target-pace" style={{ left: `${pacePct}%` }} title="Where on-pace would be today" />
        )}
      </div>
    </div>
  );
}

export function Legend({
  slices,
  total,
  activeKey,
  onHover,
  format,
}: {
  slices: Slice[];
  total: number;
  activeKey?: string | null;
  onHover?: (key: string | null) => void;
  format: (value: number) => string;
}) {
  return (
    <ul className="chart-legend" onMouseLeave={() => onHover?.(null)}>
      {slices.map((s) => (
        <li
          key={s.key}
          className={activeKey != null && activeKey !== s.key ? 'dim' : undefined}
          onMouseEnter={() => onHover?.(s.key)}
        >
          <span className="lg-sw" style={{ background: s.color }} />
          <span className="lg-label">{s.label}</span>
          <span className="lg-val">
            {format(s.value)}
            {total > 0 && <span className="lg-pct">{Math.round((s.value / total) * 100)}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
