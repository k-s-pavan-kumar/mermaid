'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Task } from '@/features/today/types';
import type { Meeting } from '@/features/meetings/types';
import { TYPE_COLOR } from '@/lib/project-colors';
import { SLOT_MINUTES, startMinutes, durationMinutes, fmtClock } from '@/features/today/time';

// Full 24 hours, same as Today — an 8am–9pm window silently hid anything
// scheduled early or late.
//
// The week view keeps whole-hour CELLS (seven columns of half-hour rows is
// unreadably dense), but blocks inside a cell are offset and sized by their
// real minute values, so a 9:30 start sits visibly below a 9:00 one and a
// 90-minute block is visibly longer than a 60-minute one. Dropping onto the
// top or bottom half of a cell chooses :00 or :30.
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROW_HEIGHT = 52;
const PX_PER_MINUTE = ROW_HEIGHT / 60;
const isNight = (h: number) => h < 6 || h >= 22;

interface ProjectRef { id: string; name: string; type: string }

function fmtHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${String(hr).padStart(2, '0')}:00 ${period}`;
}

/** Which half of a cell the pointer is in — top → :00, bottom → :30. */
function minuteFromDrop(e: React.DragEvent<HTMLDivElement>): 0 | 30 {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY - box.top > box.height / 2 ? 30 : 0;
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekDays(startIso: string): { iso: string; label: string; day: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = shiftIso(startIso, i);
    const date = new Date(iso + 'T00:00:00');
    return {
      iso,
      label: date.toLocaleDateString('en-GB', { weekday: 'long' }),
      day: String(date.getDate()).padStart(2, '0'),
    };
  });
}

/**
 * Week view.
 *
 * Today answers "what am I doing right now"; this answers "is Thursday
 * already full before I promise a client a call". Same records, same drag
 * target as Today — drop an unscheduled task on any day/hour cell and it is
 * scheduled there — plus meetings drawn in so client calls and focus blocks
 * compete for the same visible space instead of living in two systems.
 */
export function WeekGrid({
  weekStart,
  realToday,
  tasks,
  meetings,
  unscheduled,
  projects,
  scheduleTask,
  toggleTaskDone,
}: {
  weekStart: string;
  realToday: string;
  tasks: Task[];
  meetings: Meeting[];
  unscheduled: Task[];
  projects: ProjectRef[];
  scheduleTask: (id: string, date: string, hour: number, minute?: number) => Promise<void>;
  toggleTaskDone: (id: string, done: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [dragCell, setDragCell] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Land on the working part of the day instead of at midnight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const earliest = tasks
      .filter((t) => t.scheduled_hour !== null)
      .reduce<number | null>((min, t) => (min === null ? startMinutes(t) : Math.min(min, startMinutes(t))), null);
    el.scrollTop = Math.max(0, ((earliest ?? 7 * 60) - 60) * PX_PER_MINUTE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const days = weekDays(weekStart);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const monthLabel = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="week-wrap">
      <div className="week-top">
        <div>
          <h2 className="week-title">Week calendar</h2>
          <span className="week-range">
            {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} —{' '}
            {new Date(shiftIso(weekStart, 6) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div className="week-nav">
          <a href={`/calendar?week=${shiftIso(weekStart, -7)}`} aria-label="Previous week">‹</a>
          <span>{monthLabel}</span>
          <a href={`/calendar?week=${shiftIso(weekStart, 7)}`} aria-label="Next week">›</a>
          <a href="/calendar" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px', textDecoration: 'none' }}>This week</a>
        </div>
      </div>

      <div className="week-layout">
        <div className="week-scroll" ref={scrollRef}>
          <div className="week-grid" style={{ ['--rowh' as string]: `${ROW_HEIGHT}px` }}>
            <div className="week-corner" />
            {days.map((d) => (
              <div key={d.iso} className={`week-dayhead${d.iso === realToday ? ' today' : ''}`}>
                <span className="wd">{d.label}</span>
                <span className="wn">{d.day}</span>
              </div>
            ))}

            {HOURS.map((h) => (
              <div key={`row-${h}`} className="week-row-contents">
                <div className={`week-hour${isNight(h) ? ' night' : ''}`}>{fmtHour(h)}</div>
                {days.map((d) => {
                  const cellKey = `${d.iso}:${h}`;
                  const cellTasks = tasks.filter((t) => t.scheduled_date === d.iso && t.scheduled_hour === h);
                  // (a block starting at :30 still belongs to its own hour's cell,
                  //  and is nudged down inside it by marginTop below)
                  const cellMeetings = meetings.filter(
                    (m) => m.starts_at.slice(0, 10) === d.iso && new Date(m.starts_at).getHours() === h
                  );

                  return (
                    <div
                      key={cellKey}
                      className={`week-cell${dragCell === cellKey ? ' over' : ''}${d.iso === realToday ? ' is-today' : ''}${isNight(h) ? ' night' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragCell(cellKey); }}
                      onDragLeave={() => setDragCell((c) => (c === cellKey ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const minute = minuteFromDrop(e);
                        setDragCell(null);
                        const id = e.dataTransfer.getData('text/plain');
                        if (id) run(() => scheduleTask(id, d.iso, h, minute));
                      }}
                    >
                      {cellTasks.map((t) => {
                        const project = projectById.get(t.project_id ?? '');
                        const accent = project ? TYPE_COLOR[project.type as keyof typeof TYPE_COLOR] : 'var(--pine)';
                        const start = startMinutes(t);
                        const mins = durationMinutes(t);
                        const offsetInCell = start % 60; // 0 or 30
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`week-event${t.done ? ' done' : ''}${mins <= SLOT_MINUTES ? ' short' : ''}`}
                            style={{
                              borderLeftColor: accent,
                              marginTop: offsetInCell * PX_PER_MINUTE,
                              height: Math.max(18, mins * PX_PER_MINUTE - 6),
                            }}
                            onClick={() => run(() => toggleTaskDone(t.id, !t.done))}
                            title={`${t.title} · ${fmtClock(start)}–${fmtClock(start + mins)} · ${t.done ? 'done' : 'not done'}`}
                          >
                            <span className="dot" style={{ background: accent }} />
                            <span className="ttl">{t.title}</span>
                            <span className="sub">{fmtClock(start)}{project ? ` · ${project.name}` : ''}</span>
                          </button>
                        );
                      })}

                      {cellMeetings.map((m) => (
                        <a key={m.id} href={m.client_id ? `/clients/${m.client_id}?tab=meetings` : '/calendar'} className="week-event meeting">
                          <span className="dot" style={{ background: 'var(--plumrose)' }} />
                          <span className="ttl">{m.title}</span>
                          <span className="sub">{m.duration_mins} min · meeting</span>
                        </a>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="week-side">
          <div className="card">
            <h3>Unscheduled <span className="count">{unscheduled.length}</span></h3>
            {unscheduled.length === 0 ? (
              <div className="text-muted text-sm">
                <img src="/mascot/calm.png" alt="" width={72} height={72} style={{ display: 'block', margin: '0 auto 6px' }} />
                Nothing waiting. Drag work here from Today if you want to re-plan it.
              </div>
            ) : (
              unscheduled.map((t) => {
                const project = projectById.get(t.project_id ?? '');
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                    className="brain-item"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}
                  >
                    <span>{t.title}</span>
                    {project && (
                      <span style={{ fontSize: 10.5, color: TYPE_COLOR[project.type as keyof typeof TYPE_COLOR] ?? 'var(--muted)', fontWeight: 600 }}>
                        {project.name}
                      </span>
                    )}
                  </div>
                );
              })
            )}
            <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
              Drag onto any slot to schedule · click a block to tick it off
            </div>
          </div>
          {isSaving && <div className="saving-pill" role="status"><span className="spin" aria-hidden="true" /> Saving…</div>}
        </aside>
      </div>
    </div>
  );
}
