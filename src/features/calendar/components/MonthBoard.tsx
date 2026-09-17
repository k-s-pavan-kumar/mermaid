'use client';

import type { DayStats } from '@/features/today/momentum';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A month at a glance, scored by what actually happened.
 *
 * The intensity of a day is driven by focus minutes and completed tasks
 * together, because a day spent heads-down on one hard thing shows nothing
 * on a checklist and should not render as an empty day. Clicking a day opens
 * that week; clicking the number opens that day.
 */
export function MonthBoard({
  year,
  month,
  realToday,
  stats,
}: {
  year: number;
  month: number; // 0-indexed
  realToday: string;
  stats: Record<string, DayStats>;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = (new Date(year, month, 1).getDay() + 6) % 7;

  const monthDays = Array.from({ length: daysInMonth }, (_, i) => iso(year, month, i + 1));
  const totals = monthDays.reduce(
    (acc, d) => {
      const s = stats[d];
      if (!s) return acc;
      acc.done += s.done;
      acc.planned += s.planned;
      acc.focus += s.focusMinutes;
      acc.meetings += s.meetings;
      if (s.moved) acc.movedDays += 1;
      return acc;
    },
    { done: 0, planned: 0, focus: 0, meetings: 0, movedDays: 0 }
  );

  // Four bands rather than a continuous gradient: a precise score invites
  // arguing with the number instead of reading the pattern.
  function level(s?: DayStats): 0 | 1 | 2 | 3 {
    if (!s || !s.moved) return 0;
    const weight = s.done * 20 + s.focusMinutes + s.meetings * 15;
    if (weight >= 120) return 3;
    if (weight >= 50) return 2;
    return 1;
  }

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const href = (d: Date) => `/calendar?view=month&month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div>
      <div className="week-top">
        <div>
          <h2 className="week-title">{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
          <span className="week-range">
            {totals.movedDays} active days · {totals.done}/{totals.planned} tasks · {Math.round(totals.focus / 60)}h focused · {totals.meetings} meetings
          </span>
        </div>
        <div className="week-nav">
          <a href={href(prev)} aria-label="Previous month">‹</a>
          <a href={href(next)} aria-label="Next month">›</a>
          <a href="/calendar" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px', textDecoration: 'none' }}>Week view</a>
        </div>
      </div>

      <div className="card month-board">
        <div className="mb-grid mb-head">
          {WEEKDAYS.map((w) => <div key={w} className="mb-weekday">{w}</div>)}
        </div>

        <div className="mb-grid">
          {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
          {monthDays.map((date) => {
            const s = stats[date];
            const lvl = level(s);
            const day = Number(date.slice(8));
            return (
              <a
                key={date}
                href={`/calendar?week=${date}`}
                className={`mb-day lvl-${lvl}${date === realToday ? ' today' : ''}${date > realToday ? ' future' : ''}`}
                title={
                  s
                    ? `${s.done}/${s.planned} tasks · ${s.focusMinutes} min focus · ${s.meetings} meetings`
                    : 'Nothing recorded'
                }
              >
                <span className="mb-num">{day}</span>
                {s && (s.planned > 0 || s.focusMinutes > 0 || s.meetings > 0) && (
                  <span className="mb-metrics">
                    {s.planned > 0 && <span className="mb-m">{s.done}/{s.planned}</span>}
                    {s.focusMinutes > 0 && <span className="mb-m focus">{s.focusMinutes}m</span>}
                    {s.meetings > 0 && <span className="mb-m meet">{s.meetings}◦</span>}
                  </span>
                )}
              </a>
            );
          })}
        </div>

        <div className="month-legend" style={{ marginTop: 14 }}>
          <span><i className="sw lvl-0" /> nothing recorded</span>
          <span><i className="sw lvl-1" /> touched</span>
          <span><i className="sw lvl-2" /> solid</span>
          <span><i className="sw lvl-3" /> heavy</span>
          <span className="text-muted">click a day to open that week</span>
        </div>
      </div>

      <p className="text-muted text-sm">
        Focus minutes count as much as ticked boxes here on purpose — a day spent deep in one hard
        problem shows nothing on a checklist, and rendering that as an empty day is how you end up
        believing you did nothing all week.
      </p>
    </div>
  );
}
