'use client';

import { useMemo, useState } from 'react';
import { Donut, StackedBar, TargetBar, Legend, type Slice } from './Charts';
import type { DashboardData, DaySpend, CategoryMeta } from '../queries';
import { MINUTES_PER_DAY, UNTRACKED_KEY } from '../constants';

type Scope = 'today' | 'week' | 'month';

function hours(minutes: number): string {
  const h = minutes / 60;
  if (h >= 10) return `${Math.round(h)}h`;
  if (h >= 1) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(minutes)}m`;
}

function money(n: number, currency: string): string {
  // Compact on purpose: a year goal is read at a glance, and ₹12,00,000
  // wrapping onto two lines in a stat box helps nobody.
  const abs = Math.abs(n);
  const unit = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
  const prefix = unit || `${currency} `;
  if (currency === 'INR') {
    if (abs >= 1e7) return `${prefix}${(n / 1e7).toFixed(2).replace(/\.00$/, '')}Cr`;
    if (abs >= 1e5) return `${prefix}${(n / 1e5).toFixed(2).replace(/\.00$/, '')}L`;
  }
  if (abs >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}k`;
  return `${prefix}${Math.round(n)}`;
}

function prettyDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** Category map → sorted slices, largest first, with "unaccounted" pinned
 *  last so the eye lands on real work rather than on the grey wedge. */
function toSlices(buckets: Record<string, number>, categories: CategoryMeta[]): Slice[] {
  const meta = new Map(categories.map((c) => [c.key, c]));
  return Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const m = meta.get(key);
      return { key, value, label: m?.label ?? key, color: m?.color ?? 'var(--muted)' };
    })
    .sort((a, b) => {
      if (a.key === UNTRACKED_KEY) return 1;
      if (b.key === UNTRACKED_KEY) return -1;
      return b.value - a.value;
    });
}

function averageOf(days: DaySpend[]): Record<string, number> {
  if (days.length === 0) return { [UNTRACKED_KEY]: MINUTES_PER_DAY };
  const total: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.buckets)) total[k] = (total[k] ?? 0) + v;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(total)) out[k] = v / days.length;
  return out;
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [scope, setScope] = useState<Scope>('today');
  const [hovered, setHovered] = useState<string | null>(null);
  const { targets, week, month, year, categories, streaks, projectProgress } = data;

  // Days that actually have something in them — averaging a typical day
  // across a month that hasn't happened yet would make every day look empty.
  const elapsedMonthDays = useMemo(
    () => data.monthDays.filter((d) => d.date <= data.today),
    [data.monthDays, data.today]
  );
  const weekDays = useMemo(
    () => data.monthDays.filter((d) => d.date >= week.start && d.date <= week.end && d.date <= data.today),
    [data.monthDays, week.start, week.end, data.today]
  );

  const buckets = useMemo(() => {
    if (scope === 'today') return data.todaySpend.buckets;
    if (scope === 'week') return averageOf(weekDays);
    return averageOf(elapsedMonthDays);
  }, [scope, data.todaySpend, weekDays, elapsedMonthDays]);

  const slices = useMemo(() => toSlices(buckets, categories), [buckets, categories]);
  const tracked = MINUTES_PER_DAY - (buckets[UNTRACKED_KEY] ?? 0);

  const scopeNote =
    scope === 'today'
      ? prettyDate(data.today)
      : scope === 'week'
        ? `average day · ${weekDays.length} day${weekDays.length === 1 ? '' : 's'} so far this week`
        : `average day · ${elapsedMonthDays.length} day${elapsedMonthDays.length === 1 ? '' : 's'} so far this month`;

  // Shared denominator so a busy month's bar is visibly longer than a quiet
  // one's, rather than every bar filling its track.
  const monthBarMax = useMemo(() => {
    const totals = data.months.map((m) =>
      Object.entries(m.buckets).reduce((n, [k, v]) => (k === UNTRACKED_KEY ? n : n + v), 0)
    );
    return Math.max(60, ...totals);
  }, [data.months]);

  const anyTargets =
    week.targets.weekly_focus_hours > 0 || week.targets.weekly_tasks > 0 || week.targets.weekly_active_days > 0 ||
    month.targets.monthly_focus_hours > 0 || month.targets.monthly_tasks > 0 || month.targets.monthly_revenue > 0 ||
    year.targets.yearly_revenue > 0;

  const cur = targets.currency || 'INR';
  const fmtMoney = (n: number) => money(n, cur);

  return (
    <>
      {!anyTargets && (
        <div className="sync-bar" style={{ marginBottom: 18 }}>
          <span>
            No targets set yet — the charts below still show where your time and money
            actually went, but nothing has a goal to measure against.
          </span>
          <a href="/settings#targets" className="btn-ghost" style={{ textDecoration: 'none', fontSize: 12 }}>
            Set targets
          </a>
        </div>
      )}

      {/* ---------------- Streaks ---------------- */}
      <div className="card streak-card">
        <div className="streak-item">
          <span className="streak-flame" aria-hidden>
            {streaks.current > 0 ? '🔥' : '·'}
          </span>
          <div>
            <div className="streak-num">{streaks.current}</div>
            <div className="streak-lbl">day{streaks.current === 1 ? '' : 's'} in a row right now</div>
          </div>
        </div>
        <div className="streak-divider" />
        <div className="streak-item">
          <span className="streak-flame" aria-hidden>🏆</span>
          <div>
            <div className="streak-num">{streaks.longest}</div>
            <div className="streak-lbl">
              longest run, last {streaks.windowDays} days
              {streaks.longestStart && streaks.longestEnd && (
                <> · {prettyDate(streaks.longestStart)} – {prettyDate(streaks.longestEnd)}</>
              )}
            </div>
          </div>
        </div>
        <p className="text-muted streak-note">
          A day counts if a task was finished, a focus block ran, or you had a meeting —
          the same forgiving rule the weekly &ldquo;active days&rdquo; target uses.
        </p>
      </div>

      {/* ---------------- Year financial goal ---------------- */}
      <div className="section-title">
        <h3>Financial year {year.label}</h3>
        <span className="text-muted text-sm">
          {year.daysElapsed} of {year.daysTotal} days · {Math.round(year.elapsed * 100)}% elapsed
        </span>
      </div>

      <div className="card year-goal">
        <div className="year-goal-main">
          <div>
            <div className="yg-label">Paid this year</div>
            <div className="yg-value">{fmtMoney(year.revenue.paid)}</div>
            {year.targets.yearly_revenue > 0 && (
              <div className="yg-sub">
                of {fmtMoney(year.targets.yearly_revenue)} goal ·{' '}
                {(() => {
                  const pct = year.revenue.paid / year.targets.yearly_revenue;
                  const gap = pct - year.elapsed;
                  if (year.revenue.paid >= year.targets.yearly_revenue) return <b className="yg-ahead">goal met</b>;
                  if (gap >= 0.02) return <b className="yg-ahead">ahead of pace</b>;
                  if (gap <= -0.05) return <b className="yg-behind">behind pace</b>;
                  return <b>on pace</b>;
                })()}
              </div>
            )}
          </div>

          <div className="yg-secondary">
            <div className="stat-box">
              <div className="lbl">Invoiced, unpaid</div>
              <div className="val">{fmtMoney(year.revenue.outstanding)}</div>
            </div>
            <div className="stat-box">
              <div className="lbl">Focused hours</div>
              <div className="val">{year.focusHours}h</div>
            </div>
            <div className="stat-box">
              <div className="lbl">Active days</div>
              <div className="val">{year.activeDays}</div>
            </div>
            <div className="stat-box">
              <div className="lbl">Tasks done</div>
              <div className="val">{year.tasksDone}</div>
            </div>
          </div>
        </div>

        {year.targets.yearly_revenue > 0 && (
          <div className="yg-bar-wrap">
            <TargetBar
              label="Paid against the year's goal"
              value={year.revenue.paid}
              target={year.targets.yearly_revenue}
              pace={year.elapsed}
              format={fmtMoney}
            />
            <div className="yg-legend text-muted">
              The notch is where you&apos;d be if the year were earning evenly. Money
              already invoiced but not yet paid is not counted here — only what has landed.
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Week + month targets ---------------- */}
      <div className="grid-2-eq" style={{ marginTop: 22 }}>
        <div className="card">
          <h3>
            This week
            <span className="count">
              {week.daysElapsed} of {week.daysTotal} days
            </span>
          </h3>
          {week.targets.weekly_focus_hours > 0 && (
            <TargetBar label="Focused hours" value={week.focusHours} target={week.targets.weekly_focus_hours} unit="h" pace={week.elapsed} />
          )}
          {week.targets.weekly_tasks > 0 && (
            <TargetBar label="Tasks completed" value={week.tasksDone} target={week.targets.weekly_tasks} pace={week.elapsed} format={(n) => String(Math.round(n))} />
          )}
          {week.targets.weekly_active_days > 0 && (
            <TargetBar label="Days something moved" value={week.activeDays} target={week.targets.weekly_active_days} pace={week.elapsed} format={(n) => String(Math.round(n))} />
          )}
          <div className="mini-stats">
            <span><b>{week.focusHours}h</b> focused</span>
            <span><b>{week.meetingHours}h</b> in meetings</span>
            <span><b>{week.tasksDone}</b>/{week.tasksPlanned} tasks done</span>
          </div>
        </div>

        <div className="card">
          <h3>
            This month
            <span className="count">
              {month.daysElapsed} of {month.daysTotal} days
            </span>
          </h3>
          {month.targets.monthly_focus_hours > 0 && (
            <TargetBar label="Focused hours" value={month.focusHours} target={month.targets.monthly_focus_hours} unit="h" pace={month.elapsed} />
          )}
          {month.targets.monthly_tasks > 0 && (
            <TargetBar label="Tasks completed" value={month.tasksDone} target={month.targets.monthly_tasks} pace={month.elapsed} format={(n) => String(Math.round(n))} />
          )}
          {month.targets.monthly_revenue > 0 && (
            <TargetBar label="Paid this month" value={month.revenue.paid} target={month.targets.monthly_revenue} pace={month.elapsed} format={fmtMoney} />
          )}
          <div className="mini-stats">
            <span><b>{month.focusHours}h</b> focused</span>
            <span><b>{month.activeDays}</b> active days</span>
            <span><b>{fmtMoney(month.revenue.paid)}</b> paid</span>
          </div>
        </div>
      </div>

      {/* ---------------- Per-project targets ---------------- */}
      {projectProgress.length > 0 && (
        <>
          <div className="section-title"><h3>Project targets</h3></div>
          <div className="card">
            {projectProgress.map((p) => (
              <div key={p.projectId} className="proj-target-row">
                <a href={`/projects/${p.projectId}`} className="proj-target-name">{p.projectName}</a>
                <div className="proj-target-bars">
                  {p.targets.weekly_focus_hours > 0 && (
                    <TargetBar label="This week" value={p.weekFocusHours} target={p.targets.weekly_focus_hours} unit="h" />
                  )}
                  {p.targets.monthly_focus_hours > 0 && (
                    <TargetBar label="This month" value={p.monthFocusHours} target={p.targets.monthly_focus_hours} unit="h" />
                  )}
                </div>
              </div>
            ))}
            <p className="text-muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
              Set from each project&apos;s Settings tab. Only projects with a target
              show up here.
            </p>
          </div>
        </>
      )}

      {/* ---------------- 24-hour pie ---------------- */}
      <div className="section-title">
        <h3>Where the 24 hours go</h3>
        <div className="chip-row" style={{ margin: 0 }}>
          {(['today', 'week', 'month'] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`scope-chip${scope === s ? ' active' : ''}`}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
            >
              {s === 'today' ? 'Today' : s === 'week' ? 'This week' : 'This month'}
            </button>
          ))}
        </div>
      </div>

      <div className="card day-pie">
        <div className="day-pie-chart">
          <Donut
            slices={slices}
            size={224}
            thickness={38}
            centerTop={hours(tracked)}
            centerBottom="tracked"
            activeKey={hovered}
            onHover={setHovered}
          />
          <div className="text-muted" style={{ fontSize: 11.5, marginTop: 8, textAlign: 'center' }}>
            {scopeNote}
          </div>
        </div>

        <div className="day-pie-legend">
          <Legend slices={slices} total={MINUTES_PER_DAY} activeKey={hovered} onHover={setHovered} format={hours} />
          <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 0 }}>
            Built from focus sessions, scheduled blocks and meetings you already record.
            A timed block and the plan it came from are counted once, not twice. Anything
            left over is simply unaccounted — sleep, meals, everything you were never
            going to put on a timebox. Tag a task with a category in Settings to have it
            show up here as something other than its project&apos;s type.
          </p>
        </div>
      </div>

      {/* ---------------- Month-wise spread ---------------- */}
      <div className="section-title">
        <h3>Month by month</h3>
        <span className="text-muted text-sm">financial year {year.label}</span>
      </div>

      <div className="card">
        <div className="month-spread">
          {data.months.map((m) => {
            const mSlices = toSlices(m.buckets, categories).filter((s) => s.key !== UNTRACKED_KEY);
            const isNow = m.month.slice(0, 7) === data.today.slice(0, 7);
            return (
              <div key={m.month} className={`ms-row${m.future ? ' future' : ''}${isNow ? ' now' : ''}`}>
                <span className="ms-label">{m.label}</span>
                <StackedBar slices={mSlices} total={monthBarMax} activeKey={hovered} onHover={setHovered} />
                <span className="ms-figs">
                  <span className="ms-hours">{m.focusHours > 0 ? `${m.focusHours}h` : '—'}</span>
                  <span className="ms-money">{m.revenue.paid > 0 ? fmtMoney(m.revenue.paid) : '—'}</span>
                </span>
              </div>
            );
          })}
        </div>
        <Legend
          slices={toSlices(
            data.months.reduce<Record<string, number>>((acc, m) => {
              for (const [k, v] of Object.entries(m.buckets)) {
                if (k !== UNTRACKED_KEY) acc[k] = (acc[k] ?? 0) + v;
              }
              return acc;
            }, {}),
            categories
          )}
          total={data.months.reduce(
            (n, m) => n + Object.entries(m.buckets).reduce((s, [k, v]) => (k === UNTRACKED_KEY ? s : s + v), 0),
            0
          )}
          activeKey={hovered}
          onHover={setHovered}
          format={hours}
        />
        <p className="text-muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          Bars share one scale, so a longer bar really is a busier month. The two figures
          on the right are focused hours and money received.
        </p>
      </div>

      {/* ---------------- Daily strip for the current month ---------------- */}
      <div className="section-title">
        <h3>Every day this month</h3>
      </div>
      <div className="card">
        <div className="day-strip">
          {data.monthDays.map((d) => {
            const dTracked = MINUTES_PER_DAY - (d.buckets[UNTRACKED_KEY] ?? 0);
            const height = Math.min(100, (dTracked / (10 * 60)) * 100); // 10h tracked fills the column
            const future = d.date > data.today;
            return (
              <a
                key={d.date}
                href={`/today?date=${d.date}`}
                className={`ds-col${future ? ' future' : ''}${d.date === data.today ? ' today' : ''}`}
                title={`${prettyDate(d.date)} — ${hours(dTracked)} tracked, ${d.tasksDone}/${d.tasksPlanned} tasks done`}
              >
                <span className="ds-bar-wrap">
                  <span className="ds-bar" style={{ height: `${height}%` }} />
                </span>
                <span className="ds-num">{Number(d.date.slice(8))}</span>
              </a>
            );
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          Height is tracked time, capped at 10 hours. Click any day to open it on the Today board.
        </p>
      </div>
    </>
  );
}
