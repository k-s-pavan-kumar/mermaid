'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Task, DayBlock } from '../types';
import type { BrainDumpGroup, DayLoad } from '../queries';
import { FocusTimer } from '@/components/FocusTimer';
import { MonthCalendar } from './MonthCalendar';
import { DayLog } from './DayLog';
import { ActionButton } from '@/components/ActionButton';
import { SubmitButton } from '@/components/SubmitButton';
import { TYPE_COLOR } from '@/lib/project-colors';
import {
  SLOT_MINUTES, SLOTS_PER_DAY, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES,
  startMinutes, durationMinutes, slotToHourMinute, fmtClock, fmtDuration,
} from '../time';
import { DAY_BLOCK_META, DAY_MIN, segmentsForDay } from '../dayblocks';

// A full 24-hour day on a HALF-HOUR grid. The old 8am–9pm window quietly
// refused to hold early mornings and late-night work — which is exactly when
// a lot of this work actually happens — so anything scheduled outside it
// simply vanished. Night hours are dimmed rather than hidden.
//
// The grid is 48 half-hour slots. Each slot is its own drop target, so a
// task can land on 9:30 as easily as on 9:00, and resizing moves in 30-minute
// steps instead of whole hours.
const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);
const SLOT_HEIGHT = 23;           // half of the old 46px hour row — an hour still reads as 46px
const ROW_HEIGHT = SLOT_HEIGHT * 2;
const DEFAULT_SCROLL_HOUR = 7;
const isNightSlot = (slot: number) => {
  const h = Math.floor(slot / 2);
  return h < 6 || h >= 22;
};
const pxToMinutes = (px: number) => (px / SLOT_HEIGHT) * SLOT_MINUTES;
/**
 * Day arithmetic in UTC on purpose.
 *
 * The previous version parsed the date as local midnight and then formatted
 * with toISOString(), which is UTC — so in IST (+5:30) "tomorrow" came back
 * as today and the Next button did nothing at all. Working entirely in UTC
 * keeps the calendar-day arithmetic exact regardless of the viewer's offset.
 */
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function prettyDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Today" / "Yesterday" / a short date — so a backlog reads as a backlog
 * instead of an anonymous pile. */
function dumpDateLabel(iso: string, realToday: string): string {
  if (iso === realToday) return 'Today';
  if (iso === shiftDate(realToday, -1)) return 'Yesterday';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface ProjectRef { id: string; name: string; type: string }
interface CategoryRef { key: string; label: string; color: string }

interface Props {
  date: string;
  realToday: string;
  brainDumpGroups: BrainDumpGroup[];
  tasks: Task[];
  overdue: Task[];
  dayLoads: Record<string, DayLoad>;
  streak: { days: number; todayMoved: boolean };
  stalled: { id: string; name: string; days: number }[];
  focusMinutesToday: number;
  projects: ProjectRef[];
  /** User-defined categories from Settings — empty means nobody's defined
   *  any yet, in which case the category picker doesn't render at all. */
  categories: CategoryRef[];
  addTask: (formData: FormData) => Promise<void>;
  scheduleTask: (id: string, date: string, hour: number, minute?: number) => Promise<void>;
  resizeTask: (id: string, durationMinutes: number) => Promise<void>;
  unscheduleTask: (id: string) => Promise<void>;
  toggleTaskDone: (id: string, done: boolean) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveTaskToToday: (id: string, todayDate: string) => Promise<void>;
  moveAllOverdueToToday: (todayDate: string) => Promise<void>;
  setOneThing: (taskId: string, date: string) => Promise<void>;
  setTaskCategory: (id: string, category: string) => Promise<void>;
  dayBlocks: DayBlock[];
  logSleep: (formData: FormData) => Promise<void>;
  addDayBlock: (formData: FormData) => Promise<void>;
  deleteDayBlock: (id: string) => Promise<void>;
  logFocusSession: (input: { minutes: number; completedMinutes: number; taskId?: string | null; projectId?: string | null; note?: string | null }) => Promise<void>;
}

function ProjectBadge({ project }: { project?: ProjectRef }) {
  if (!project) return null;
  const color = TYPE_COLOR[project.type as keyof typeof TYPE_COLOR] ?? 'var(--muted)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color, fontWeight: 600, flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {project.name}
    </span>
  );
}

/**
 * The category tag on a task card. Only rendered when at least one custom
 * category exists — with none defined, every task simply buckets by its
 * project's type on the Dashboard, and this control would have nothing
 * useful to offer.
 */
function CategorySelect({
  task, categories, setTaskCategory,
}: {
  task: Task;
  categories: CategoryRef[];
  setTaskCategory: (id: string, category: string) => Promise<void>;
}) {
  if (categories.length === 0) return null;
  const current = categories.find((c) => c.key === task.category);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <span className="task-cat-dot" style={{ background: current?.color ?? 'var(--border)' }} />
      <select
        className="task-cat-select"
        value={task.category ?? ''}
        onChange={(e) => { void setTaskCategory(task.id, e.target.value); }}
        onClick={(e) => e.stopPropagation()}
        title="Dashboard category — overrides the project's type"
        draggable={false}
      >
        <option value="">by project</option>
        {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
    </span>
  );
}

export function TodayClient({
  date, realToday, brainDumpGroups, tasks, overdue, dayLoads, projects, categories,
  streak, stalled, focusMinutesToday,
  addTask, scheduleTask, resizeTask, unscheduleTask, toggleTaskDone, deleteTask, moveTaskToToday,
  moveAllOverdueToToday, setOneThing, setTaskCategory, logFocusSession,
  dayBlocks, logSleep, addDayBlock, deleteDayBlock,
}: Props) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  // Opens on its own when something is already overdue — that's precisely
  // the case where a day looks empty but isn't.
  const [showCalendar, setShowCalendar] = useState(overdue.length > 0);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [liveDuration, setLiveDuration] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ id: string; startY: number; startDuration: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open the grid where the day actually is rather than at 12am, so a
  // 24-hour column doesn't cost a scroll on every visit.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstBlock = tasks
      .filter((t) => t.scheduled_hour !== null)
      .reduce<number | null>((min, t) => (min === null ? startMinutes(t) : Math.min(min, startMinutes(t))), null);
    const nowMinutes = date === realToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
    const target = firstBlock ?? nowMinutes ?? DEFAULT_SCROLL_HOUR * 60;
    // Show half an hour of lead-in above the first block.
    el.scrollTop = Math.max(0, ((target - 30) / SLOT_MINUTES) * SLOT_HEIGHT);
    // Only on a date change — re-running on every task edit would yank the
    // scroll position out from under you mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function withRefresh(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));

  // ---- drag-resize: mousedown on a handle starts tracking; mousemove
  // computes the hour delta from pixel movement; mouseup commits it. ----
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      // Snap to the nearest half hour rather than the nearest hour — this is
      // the whole point of the finer grid.
      const deltaSlots = Math.round(pxToMinutes(e.clientY - r.startY) / SLOT_MINUTES);
      const next = Math.max(
        MIN_DURATION_MINUTES,
        Math.min(MAX_DURATION_MINUTES, r.startDuration + deltaSlots * SLOT_MINUTES)
      );
      setLiveDuration((d) => ({ ...d, [r.id]: next }));
    }
    function onUp() {
      const r = resizingRef.current;
      if (!r) return;
      resizingRef.current = null;
      const final = liveDuration[r.id];
      if (final !== undefined && final !== r.startDuration) {
        withRefresh(async () => {
          await resizeTask(r.id, final);
          // Drop the optimistic override once the server value is the
          // source of truth again; leaving it in place would pin the block
          // to a stale height if the save were ever rejected.
          setLiveDuration((d) => {
            const { [r.id]: _dropped, ...rest } = d;
            return rest;
          });
        });
      } else {
        setLiveDuration((d) => {
          const { [r.id]: _dropped, ...rest } = d;
          return rest;
        });
      }
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDuration]);

  function startResize(taskId: string, currentDuration: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { id: taskId, startY: e.clientY, startDuration: currentDuration };
    setLiveDuration((d) => ({ ...d, [taskId]: currentDuration }));
    document.body.style.userSelect = 'none';
  }

  const scheduled = tasks.filter((t) => t.scheduled_hour !== null);
  const plannedMinutes = scheduled.reduce((n, t) => n + durationMinutes(t), 0);
  // Sleep / office / travel, drawn as full-width translucent bands behind
  // the task blocks (same day-boundary math Calendar's week view uses).
  const daySegments = segmentsForDay(dayBlocks, date);

  const oneThing = tasks.find((t) => t.focus_date === date) ?? null;
  const dayTasks = tasks.filter((t) => t.scheduled_hour !== null);
  const doneCount = dayTasks.filter((t) => t.done).length;
  const candidates = [...dayTasks, ...brainDumpGroups.flatMap((g) => g.tasks)].filter((t) => !t.done);

  return (
    <>
    <div className="momentum-bar">
      <span className="mo-item">
        <img src={`/mascot/${streak.days > 0 ? 'celebrate' : 'idle'}.png`} alt="" width={30} height={30} />
        <b>{streak.days}</b> day{streak.days === 1 ? '' : 's'} in a row something moved
      </span>
      <span className="mo-item">
        <b>{doneCount}</b>/{dayTasks.length} done today
      </span>
      <span className="mo-item">
        <b>{focusMinutesToday}</b> min focused
      </span>
      {!streak.todayMoved && streak.days > 0 && (
        <span className="mo-nudge">One finished thing keeps the streak — anything counts.</span>
      )}
    </div>

    <div className="one-thing">
      <div className="one-thing-head">
        <span className="ot-label">If nothing else happens today</span>
        {oneThing ? (
          <ActionButton action={() => setOneThing(oneThing.id, date)} className="btn-link" pendingLabel="…">
            clear
          </ActionButton>
        ) : null}
      </div>

      {oneThing ? (
        <div className="one-thing-pick">
          <ActionButton
            action={() => toggleTaskDone(oneThing.id, !oneThing.done)}
            className={`check-btn${oneThing.done ? ' checked' : ''}`}
            aria-label="Toggle done"
          >
            <span className="sr-only">done</span>
          </ActionButton>
          <span style={{ textDecoration: oneThing.done ? 'line-through' : 'none' }}>{oneThing.title}</span>
          {oneThing.done && <span className="ot-won">that&apos;s the day won</span>}
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-muted text-sm" style={{ margin: 0 }}>Add something first and you can pin it here.</p>
      ) : (
        <div className="ot-choices">
          {candidates.slice(0, 6).map((t) => (
            <ActionButton key={t.id} action={() => setOneThing(t.id, date)} className="ot-choice" pendingLabel="…">
              {t.title}
            </ActionButton>
          ))}
        </div>
      )}
    </div>

    {stalled.length > 0 && (
      <details className="stalled-bar">
        <summary>
          <img src="/mascot/search.png" alt="" width={24} height={24} />
          {stalled.length} project{stalled.length > 1 ? 's' : ''} haven&apos;t moved in a while
        </summary>
        <div className="stalled-list">
          {stalled.slice(0, 6).map((p) => (
            <a key={p.id} href={`/projects/${p.id}?tab=skills`} className="stalled-row">
              <span>{p.name}</span>
              <span className="text-muted">{p.days > 900 ? 'never started' : `${p.days} days quiet`}</span>
            </a>
          ))}
          <p className="text-muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            Shelving one on purpose counts as a decision. Open a project and run
            &ldquo;Why am I stuck here?&rdquo; if you want a second opinion.
          </p>
        </div>
      </details>
    )}

    <div className="grid-2">
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Brain dump <span className="count">{brainDumpGroups.reduce((n, g) => n + g.tasks.length, 0)} open</span></h3>
          <form action={addTask} style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
            <input name="title" placeholder="Dump a thought or task…" required />
            {projects.length > 0 && (
              <select name="project_id" defaultValue="" style={{ fontSize: 12.5 }}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <SubmitButton className="btn-inline" pendingLabel="Adding…" style={{ width: 'fit-content' }}>Add</SubmitButton>
          </form>

          {brainDumpGroups.length === 0 && (
            <div className="text-muted text-sm" style={{ textAlign: 'center' }}>
              <img src="/mascot/calm.png" alt="" width={80} height={80} style={{ display: 'block', margin: '0 auto 4px' }} />
              Nothing waiting — nice.
            </div>
          )}
          {brainDumpGroups.map((group) => (
            <div key={group.date} style={{ marginBottom: 14 }}>
              <div className="dump-date-label">
                {dumpDateLabel(group.date, realToday)}
                <span className="text-muted" style={{ fontWeight: 400 }}> · {group.tasks.length}</span>
              </div>
              {group.tasks.map((t) => (
                <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="brain-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.title}</span>
                    <ActionButton action={() => deleteTask(t.id)} className="btn-link" style={{ color: '#aaa' }} aria-label="Delete task" pendingLabel="…">×</ActionButton>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ProjectBadge project={projectById.get(t.project_id ?? '')} />
                    <CategorySelect task={t} categories={categories} setTaskCategory={setTaskCategory} />
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
            Drag a card onto any half-hour slot · drag a block's bottom edge to resize in 30-min steps →
          </div>
        </div>

        <FocusTimer
          tasks={candidates.slice(0, 20).map((t) => ({ id: t.id, title: t.title, project_id: t.project_id }))}
          logSession={logFocusSession}
        />
      </div>

      <div>
        <div className="day-nav">
          <a href={`/today?date=${shiftDate(date, -1)}`}>‹ Prev</a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="dlabel">{prettyDate(date)}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => { if (e.target.value) router.push(`/today?date=${e.target.value}`); }}
              className="date-jump"
              title="Jump to any date"
            />
            {date !== realToday && (
              <a href="/today" className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px', textDecoration: 'none' }}>
                Today
              </a>
            )}
            <button
              type="button"
              className={`btn-ghost${showCalendar ? ' on' : ''}`}
              style={{ fontSize: 11.5, padding: '4px 10px' }}
              onClick={() => setShowCalendar((v) => !v)}
              aria-expanded={showCalendar}
            >
              {showCalendar ? 'Hide calendar' : 'Calendar'}
              {overdue.length > 0 && !showCalendar && <span className="nav-count" style={{ marginLeft: 6 }}>{overdue.length}</span>}
            </button>
          </span>
          <a href={`/today?date=${shiftDate(date, 1)}`}>Next ›</a>
        </div>

        {showCalendar && (
          <MonthCalendar
            activeDate={date}
            realToday={realToday}
            loads={dayLoads}
            onClose={() => setShowCalendar(false)}
          />
        )}

        {overdue.length > 0 && (
          <div className="card overdue-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: 'var(--crimson)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="/mascot/worried.png" alt="" width={28} height={28} />
                {overdue.length} pending task{overdue.length > 1 ? 's' : ''} from earlier days
              </strong>
              <ActionButton
                action={() => moveAllOverdueToToday(realToday)}
                className="btn-ghost"
                pendingLabel="Moving…"
                style={{ fontSize: 11.5, padding: '4px 9px' }}
              >
                Move all to today
              </ActionButton>
            </div>
            {overdue.map((t) => (
              <div key={t.id} className="list-row" style={{ padding: '7px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="mono text-muted" style={{ fontSize: 11 }}>{t.scheduled_date}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <ProjectBadge project={projectById.get(t.project_id ?? '')} />
                </span>
                <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <ActionButton action={() => moveTaskToToday(t.id, realToday)} className="btn-ghost" pendingLabel="Moving…" style={{ fontSize: 11.5, padding: '4px 9px' }}>
                    Move to today
                  </ActionButton>
                  <ActionButton action={() => unscheduleTask(t.id)} className="btn-ghost" pendingLabel="…" style={{ fontSize: 11.5, padding: '4px 9px' }}>
                    Unschedule
                  </ActionButton>
                </span>
              </div>
            ))}
          </div>
        )}

        <DayLog
          date={date}
          blocks={dayBlocks}
          plannedMinutes={plannedMinutes}
          logSleep={logSleep}
          addDayBlock={addDayBlock}
          deleteDayBlock={deleteDayBlock}
        />

        {isSaving && (
          <div className="saving-pill" role="status" aria-live="polite">
            <span className="spin" aria-hidden="true" /> Saving…
          </div>
        )}

        <div className="timebox-scroll" ref={scrollRef}>
        <div className="card timebox-cal" style={{ padding: 0 }} ref={gridRef}>
          {/* Background half-hour grid — also the drop targets. Every slot is
              droppable, so 9:30 is as easy to hit as 9:00; only the top slot
              of each hour carries the gutter label, and the :30 slot's
              divider is drawn lighter so the hour is still the unit you read. */}
          {SLOTS.map((slot) => {
            const { hour, minute } = slotToHourMinute(slot);
            const isHalf = minute === 30;
            return (
              <div
                key={slot}
                className={`timebox-slot${isHalf ? ' half' : ''}${isNightSlot(slot) ? ' night' : ''}${dragOverSlot === slot ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlot(slot); }}
                onDragLeave={() => setDragOverSlot((c) => (c === slot ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) withRefresh(() => scheduleTask(id, date, hour, minute));
                }}
              >
                <div className="hour-label">{isHalf ? '' : fmtClock(hour * 60)}</div>
                <div />
              </div>
            );
          })}

          {/* Foreground overlay — variable-height task blocks positioned by
              time, independent of the row grid underneath, so a block can
              span multiple hours. */}
          <div className="timebox-overlay" style={{ top: 0 }}>
            {daySegments.map((seg) => {
              const meta = DAY_BLOCK_META[seg.kind];
              const top = (seg.startMin / SLOT_MINUTES) * SLOT_HEIGHT;
              const height = Math.max(SLOT_HEIGHT - 2, ((seg.endMin - seg.startMin) / SLOT_MINUTES) * SLOT_HEIGHT - 2);
              const minutes = seg.endMin - seg.startMin;
              return (
                <div
                  key={`${seg.block.id}-${seg.startMin}`}
                  className={`tb-dayblock-band dk-${seg.kind}`}
                  style={{ top, height }}
                  title={`${meta.label}${seg.block.note ? ` · ${seg.block.note}` : ''} · ${fmtClock(seg.startMin)} – ${seg.endMin >= DAY_MIN ? '12 AM' : fmtClock(seg.endMin)}${seg.continuesFromPrev ? ' (started yesterday)' : ''}${seg.continuesToNext ? ' (continues tomorrow)' : ''}`}
                >
                  {height >= 26 && (
                    <span className="tb-dayblock-label">
                      {meta.emoji} {meta.label}{height >= 42 ? ` · ${fmtDuration(minutes)}` : ''}
                    </span>
                  )}
                </div>
              );
            })}
            {scheduled.length === 0 && (
              <div className="timebox-empty">
                <img src="/mascot/sleeping.png" alt="" width={86} height={86} />
                <br />
                Nothing scheduled for {date === realToday ? 'today' : prettyDate(date)}.
                {' '}Drag a card from the brain dump onto an hour
                {overdue.length > 0 ? ', or pull an unfinished task forward from the list above.' : '.'}
              </div>
            )}
            {scheduled.map((t) => {
              const start = startMinutes(t);
              const duration = liveDuration[t.id] ?? durationMinutes(t);
              const top = (start / SLOT_MINUTES) * SLOT_HEIGHT;
              const height = Math.max(SLOT_HEIGHT - 2, (duration / SLOT_MINUTES) * SLOT_HEIGHT - 3);
              const project = projectById.get(t.project_id ?? '');
              const accent = project ? TYPE_COLOR[project.type as keyof typeof TYPE_COLOR] : 'var(--pine)';
              // A 30-minute block has no room for a second line, so it
              // collapses to title + time on one row instead of clipping.
              const compact = duration <= SLOT_MINUTES;
              const rangeLabel = `${fmtClock(start)} – ${fmtClock(start + duration)}`;

              return (
                <div
                  key={t.id}
                  className={`tb-block-abs${compact ? ' compact' : ''}${resizingRef.current?.id === t.id ? ' resizing' : ''}`}
                  style={{
                    top, height,
                    background: 'var(--pine-soft)',
                    borderLeft: `3px solid ${accent}`,
                    opacity: t.done ? 0.55 : 1,
                  }}
                  title={`${t.title} · ${rangeLabel}`}
                >
                  <div className="tb-block-inner">
                    <div style={{ minWidth: 0 }}>
                      <div className="tb-title" style={{ textDecoration: t.done ? 'line-through' : 'none' }}>
                        {t.title}
                      </div>
                      {compact ? null : <ProjectBadge project={project} />}
                      {compact ? null : <CategorySelect task={t} categories={categories} setTaskCategory={setTaskCategory} />}
                      <div className="tb-time">{rangeLabel} · {fmtDuration(duration)}</div>
                    </div>
                    <span style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                      <ActionButton action={() => toggleTaskDone(t.id, !t.done)} className="btn-link" style={{ color: 'var(--pine)' }} title="Toggle done" aria-label="Toggle done" pendingLabel="·">✓</ActionButton>
                      <ActionButton action={() => unscheduleTask(t.id)} className="btn-link" style={{ color: 'var(--pine)' }} title="Back to brain dump" aria-label="Back to brain dump" pendingLabel="·">↺</ActionButton>
                    </span>
                  </div>
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => startResize(t.id, durationMinutes(t), e)}
                    title="Drag to resize — snaps to 30 minutes"
                  />
                  {/* Live read-out while dragging the bottom edge, so you can
                      see "1h 30m" land rather than guessing from pixels. */}
                  {liveDuration[t.id] !== undefined && resizingRef.current?.id === t.id && (
                    <span className="tb-resize-pill">{fmtDuration(duration)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </div>
    </>
  );
}
