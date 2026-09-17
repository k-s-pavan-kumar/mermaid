'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DayLoad } from '../queries';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

function monthName(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Month view for the Today board.
 *
 * Today is scoped to a single day, which is correct — but it meant an
 * unfinished task from last Tuesday was invisible unless you happened to
 * click Prev the right number of times. This shows the whole month at a
 * glance: days carrying open work are marked, past days with open work are
 * marked in red, and clicking any day jumps straight to it.
 */
export function MonthCalendar({
  activeDate,
  realToday,
  loads,
  onClose,
}: {
  activeDate: string;
  realToday: string;
  loads: Record<string, DayLoad>;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const parts = activeDate.split('-').map(Number);
    const now = new Date();
    return { y: parts[0] ?? now.getFullYear(), m: (parts[1] ?? now.getMonth() + 1) - 1 };
  });

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const blanks = leadingBlanks(cursor.y, cursor.m);

  function shiftMonth(delta: number) {
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function go(date: string) {
    router.push(`/today?date=${date}`);
    onClose?.();
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="card month-cal">
      <div className="month-head">
        <button type="button" className="btn-ghost icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthName(cursor.y, cursor.m)}</strong>
        <button type="button" className="btn-ghost icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="month-grid month-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="month-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="month-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;

          const date = iso(cursor.y, cursor.m, day);
          const load = loads[date];
          const isToday = date === realToday;
          const isActive = date === activeDate;
          const overdue = !!load && load.pending > 0 && date < realToday;

          const classes = [
            'month-day',
            isActive ? 'active' : '',
            isToday ? 'today' : '',
            overdue ? 'overdue' : '',
            load && load.pending > 0 && !overdue ? 'has-pending' : '',
            load && load.pending === 0 && load.total > 0 ? 'all-done' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={date}
              type="button"
              className={classes}
              onClick={() => go(date)}
              title={
                load
                  ? `${load.pending} open · ${load.done} done`
                  : 'Nothing scheduled'
              }
            >
              <span className="d">{day}</span>
              {load && load.pending > 0 && <span className="count">{load.pending}</span>}
              {load && load.pending === 0 && load.total > 0 && <span className="tick">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="month-legend">
        <span>
          <i className="sw overdue" /> past, still open
        </span>
        <span>
          <i className="sw pending" /> scheduled
        </span>
        <span>
          <i className="sw done" /> all done
        </span>
      </div>
    </div>
  );
}
