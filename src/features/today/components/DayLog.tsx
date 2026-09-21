'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DayBlock, DayBlockKind } from '../types';
import { fmtClock, fmtDuration } from '../time';
import {
  DAY_MIN, DAY_BLOCK_META, blockRangeLabel, daySummary, endDate, minutesToHHMM,
  parseHHMM, segmentsForDay, sleepEndingOn, spanMinutes,
} from '../dayblocks';

type OpenForm = DayBlockKind | null;

const KINDS: DayBlockKind[] = ['sleep', 'office', 'travel'];
// What the office / travel forms start with. Just a starting point — every
// field is editable before saving.
const DEFAULT_RANGE: Record<'office' | 'travel', { from: string; to: string }> = {
  office: { from: '09:00', to: '18:00' },
  travel: { from: '08:00', to: '09:00' },
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The day log: sleep, office and travel time for the day being viewed, with
 * a 24-hour bar, per-kind totals, and the forms to add them. Blocks also
 * appear as a lane beside the timebox grid (rendered by TodayClient).
 */
export function DayLog({
  date, blocks, plannedMinutes, logSleep, addDayBlock, deleteDayBlock,
}: {
  date: string;
  blocks: DayBlock[];
  plannedMinutes: number;
  logSleep: (formData: FormData) => Promise<void>;
  addDayBlock: (formData: FormData) => Promise<void>;
  deleteDayBlock: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<OpenForm>(null);

  const night = sleepEndingOn(blocks, date);
  const summary = daySummary(blocks, date);
  const segments = useMemo(() => segmentsForDay(blocks, date), [blocks, date]);

  // Chips: this day's office/travel blocks, plus the night's sleep that ended
  // this morning (tonight's sleep is logged tomorrow, when you wake up).
  const chips = blocks
    .filter((b) => (b.kind === 'sleep' ? night?.id === b.id : b.date === date))
    .sort((a, b) => (a.kind === 'sleep' ? -1 : b.kind === 'sleep' ? 1 : a.start_minute - b.start_minute));

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const hasAny = segments.length > 0 || night !== null;

  return (
    <div className="card daylog">
      <div className="daylog-head">
        <strong>Day log</strong>
        <span className="text-muted" style={{ fontSize: 11.5 }}>Sleep · office · travel</span>
      </div>

      {/* 24-hour bar: where the day's blocks sit, midnight to midnight. */}
      <div className="daylog-bar" aria-label="24-hour view of sleep, office and travel">
        {segments.map((s) => {
          const meta = DAY_BLOCK_META[s.kind];
          return (
            <span
              key={`${s.block.id}-${s.startMin}`}
              className="daylog-bar-seg"
              style={{ left: `${(s.startMin / DAY_MIN) * 100}%`, width: `${((s.endMin - s.startMin) / DAY_MIN) * 100}%`, background: meta.color }}
              title={`${meta.label} · ${fmtClock(s.startMin)} – ${fmtClock(s.endMin)}`}
            />
          );
        })}
      </div>
      <div className="daylog-ticks"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>

      <div className="daylog-legend">
        {KINDS.map((k) => {
          const meta = DAY_BLOCK_META[k];
          const minutes = summary[k];
          return (
            <span key={k} className="daylog-stat">
              <i style={{ background: meta.color }} />
              {meta.label} <b>{minutes > 0 ? fmtDuration(minutes) : '—'}</b>
            </span>
          );
        })}
        <span className="daylog-stat">
          <i style={{ background: 'var(--border)' }} />
          Tasks planned <b>{plannedMinutes > 0 ? fmtDuration(plannedMinutes) : '—'}</b>
        </span>
      </div>

      <div className="daylog-actions">
        {KINDS.map((k) => {
          const meta = DAY_BLOCK_META[k];
          return (
            <button key={k} type="button" className={`btn-ghost${open === k ? ' on' : ''}`} style={{ fontSize: 12, padding: '4px 11px' }}
              onClick={() => setOpen((cur) => (cur === k ? null : k))} aria-expanded={open === k}>
              {meta.emoji} {k === 'sleep' ? (night ? 'Edit sleep' : 'Log sleep') : `+ ${meta.label}`}
            </button>
          );
        })}
        {pending && <span className="text-muted" style={{ fontSize: 11.5 }}>Saving…</span>}
      </div>

      {open === 'sleep' && (
        <SleepForm
          key={night?.id ?? 'new'}
          date={date}
          night={night}
          onSave={(fd) => { run(() => logSleep(fd)); setOpen(null); }}
        />
      )}
      {(open === 'office' || open === 'travel') && (
        <BlockForm
          key={open}
          date={date}
          kind={open}
          onSave={(fd) => { run(() => addDayBlock(fd)); setOpen(null); }}
        />
      )}

      {hasAny ? (
        <div className="daylog-chips">
          {chips.map((b) => {
            const meta = DAY_BLOCK_META[b.kind];
            return (
              <span key={b.id} className="daylog-chip" style={{ borderLeftColor: meta.color }}>
                <span>
                  {meta.emoji} {b.kind === 'sleep' ? 'Slept' : meta.label} {blockRangeLabel(b)}
                  {' · '}<b>{fmtDuration(b.duration_minutes)}</b>
                  {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                </span>
                <button type="button" className="df-del" title="Remove" onClick={() => run(() => deleteDayBlock(b.id))}>×</button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Log when you slept and woke, your office hours and any travel — the day fills in here and beside the time grid.
        </p>
      )}
    </div>
  );
}

function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}{' '}
        <button type="button" className="link-btn" style={{ fontSize: 11 }} onClick={() => onChange(nowHHMM())}>now</button>
      </label>
      <input id={id} type="time" required value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }} />
    </div>
  );
}

function SleepForm({ date, night, onSave }: { date: string; night: DayBlock | null; onSave: (fd: FormData) => void }) {
  const [sleptAt, setSleptAt] = useState(night ? minutesToHHMM(night.start_minute) : '23:00');
  const [wokeAt, setWokeAt] = useState(night ? minutesToHHMM(night.start_minute + night.duration_minutes) : '06:30');
  const bed = parseHHMM(sleptAt);
  const wake = parseHHMM(wokeAt);
  const duration = bed !== null && wake !== null ? spanMinutes(bed, wake) : null;

  return (
    <form className="daylog-form" onSubmit={(e) => {
      e.preventDefault();
      if (duration === null) return;
      const fd = new FormData();
      fd.set('date', date); fd.set('slept_at', sleptAt); fd.set('woke_at', wokeAt);
      onSave(fd);
    }}>
      <TimeField id="dl-slept" label="Slept at" value={sleptAt} onChange={setSleptAt} />
      <TimeField id="dl-woke" label="Woke up" value={wokeAt} onChange={setWokeAt} />
      <div className="daylog-form-foot">
        <span className={duration === null ? 'daylog-warn' : 'text-muted'} style={{ fontSize: 12 }}>
          {duration === null ? 'Check the times — sleep can be up to 16 hours.' : <>Sleep: <b>{fmtDuration(duration)}</b> (woke on this day; bed time is the night before if later than wake-up)</>}
        </span>
        <button type="submit" className="btn" style={{ fontSize: 12.5 }} disabled={duration === null}>Save sleep</button>
      </div>
    </form>
  );
}

function BlockForm({ date, kind, onSave }: { date: string; kind: 'office' | 'travel'; onSave: (fd: FormData) => void }) {
  const [from, setFrom] = useState(DEFAULT_RANGE[kind].from);
  const [to, setTo] = useState(DEFAULT_RANGE[kind].to);
  const [note, setNote] = useState('');
  const a = parseHHMM(from);
  const b = parseHHMM(to);
  const duration = a !== null && b !== null ? spanMinutes(a, b) : null;
  const meta = DAY_BLOCK_META[kind];

  return (
    <form className="daylog-form" onSubmit={(e) => {
      e.preventDefault();
      if (duration === null) return;
      const fd = new FormData();
      fd.set('date', date); fd.set('kind', kind); fd.set('from', from); fd.set('to', to); fd.set('note', note);
      onSave(fd);
    }}>
      <TimeField id="dl-from" label="From" value={from} onChange={setFrom} />
      <TimeField id="dl-to" label="To" value={to} onChange={setTo} />
      <div style={{ gridColumn: '1 / -1' }}>
        <label className="field-label" htmlFor="dl-note">Note (optional)</label>
        <input id="dl-note" type="text" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'travel' ? 'e.g. Home → office, metro' : 'e.g. Team day'} style={{ width: '100%' }} />
      </div>
      <div className="daylog-form-foot">
        <span className={duration === null ? 'daylog-warn' : 'text-muted'} style={{ fontSize: 12 }}>
          {duration === null ? 'Check the times.' : <>{meta.label}: <b>{fmtDuration(duration)}</b></>}
        </span>
        <button type="submit" className="btn" style={{ fontSize: 12.5 }} disabled={duration === null}>Add {meta.label.toLowerCase()}</button>
      </div>
    </form>
  );
}
