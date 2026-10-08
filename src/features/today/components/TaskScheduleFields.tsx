'use client';

import { useMemo, useRef, useState } from 'react';
import { MAX_OCCURRENCES, WEEKDAY_LABELS, expandDates, isValidIso, parseTimeInput } from '../recurrence';
import { describeQuickParse, parseQuickAdd } from '../quickadd';

/**
 * Optional scheduling fields for the "Add a task" form: a date, a From/To
 * time (hours are worked out from the two), and an optional repeat with a
 * required end date, chosen weekdays and skip dates for festivals/leave.
 * Everything is plain named inputs, so the surrounding <form action> server
 * action reads them with no client-side submit handler.
 */

const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Mon–Sat', days: [1, 2, 3, 4, 5, 6] },
];

const fmtH = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

export function TaskScheduleFields({ today }: { today: string }) {
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [skip, setSkip] = useState<string[]>([]);
  const [skipDraft, setSkipDraft] = useState('');
  const [due, setDue] = useState('');
  const [quick, setQuick] = useState('');
  const [understood, setUnderstood] = useState<{ chips: string[]; notes: string[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /** Read the plain-words box and fill every field (and the title) from it. */
  function fillFromQuick() {
    if (!quick.trim()) return;
    const q = parseQuickAdd(quick, today);
    setDate(q.date ?? '');
    setFrom(q.start ?? '');
    setTo(q.end ?? '');
    setRepeat(q.repeat);
    setUntil(q.until ?? '');
    setDays(q.weekdays.length ? q.weekdays : [1, 2, 3, 4, 5]);
    setSkip(q.skip);
    setDue(q.due ?? '');
    const titleInput = wrapRef.current?.closest('form')?.elements.namedItem('title');
    if (titleInput instanceof HTMLInputElement) titleInput.value = q.title;
    setUnderstood({ chips: describeQuickParse(q), notes: q.notes });
  }

  const a = parseTimeInput(from);
  const b = parseTimeInput(to);
  const minutes = a !== null && b !== null && b > a ? Math.min(480, Math.max(30, Math.round((b - a) / 30) * 30)) : null;
  const badRange = a !== null && b !== null && b <= a;

  const exp = useMemo(
    () => (repeat && date && until ? expandDates({ start: date, end: until, weekdays: days, skip }) : null),
    [repeat, date, until, days, skip],
  );

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const addSkip = () => {
    if (isValidIso(skipDraft) && !skip.includes(skipDraft)) setSkip([...skip, skipDraft].sort());
    setSkipDraft('');
  };

  const fieldCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 };
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    border: '1px solid var(--line, #d9d6ee)', background: on ? 'var(--accent, #5b3fd6)' : 'transparent',
    color: on ? '#fff' : 'inherit',
  });

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '10px 0 14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fillFromQuick(); } }}
            placeholder='Lazy mode — type it: "UI UX class 9-10 every weekday till 31 oct skip 20 oct"'
            aria-label="Type the task in plain words"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-ghost" onClick={fillFromQuick} disabled={!quick.trim()}>Fill form</button>
        </div>
        {understood && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span className="text-muted">Understood:</span>
            {understood.chips.length === 0 && <span className="text-muted">just a task, no date</span>}
            {understood.chips.map((c) => <span key={c} style={chip(true)}>{c}</span>)}
            {understood.notes.map((n) => <span key={n} style={{ color: '#c0392b' }}>⚠ {n}</span>)}
            <span className="text-muted">— check below, then Add.</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={fieldCol}>Date
          <input name="date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={fieldCol}>From
          <input name="start_time" type="time" step={1800} value={from} onChange={(e) => setFrom(e.target.value)} required={!!date} />
        </label>
        <label style={fieldCol}>To
          <input name="end_time" type="time" step={1800} value={to} onChange={(e) => setTo(e.target.value)} required={!!date} />
        </label>
        <label style={fieldCol}>Deadline (optional)
          <input name="due_date" type="date" value={repeat ? '' : due} disabled={repeat} min={today} onChange={(e) => setDue(e.target.value)} />
        </label>
        <span className="text-muted" style={{ fontSize: 12.5, paddingBottom: 8 }}>
          {minutes ? <>= <strong style={{ color: 'inherit' }}>{fmtH(minutes)}</strong> per day</> : badRange ? 'End time must be after start' : 'Pick a date and From/To to put it on the calendar'}
        </span>
      </div>

      {date && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="repeat" value="1" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Repeat this task
        </label>
      )}

      {date && repeat && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {PRESETS.map((p) => (
              <button type="button" key={p.label} style={chip(p.days.length === days.length && p.days.every((d) => days.includes(d)))} onClick={() => setDays(p.days)}>{p.label}</button>
            ))}
            <span className="text-muted" style={{ fontSize: 11.5, margin: '0 4px' }}>or pick days:</span>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button type="button" key={d} style={chip(days.includes(d))} onClick={() => toggleDay(d)}>{WEEKDAY_LABELS[d]}</button>
            ))}
          </div>
          {days.map((d) => <input key={d} type="hidden" name="weekdays" value={d} />)}

          <label style={fieldCol}>Repeat until (last day, required)
            <input name="repeat_until" type="date" value={until} min={date} required onChange={(e) => setUntil(e.target.value)} style={{ maxWidth: 200 }} />
          </label>

          <div style={fieldCol}>
            <span>Skip dates — festivals, holidays, leave</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={skipDraft} min={date} max={until || undefined} onChange={(e) => setSkipDraft(e.target.value)} />
              <button type="button" className="btn-inline" onClick={addSkip} disabled={!skipDraft}>Skip this day</button>
              {skip.map((s) => (
                <button type="button" key={s} style={chip(false)} onClick={() => setSkip(skip.filter((x) => x !== s))} title="Click to remove">{s} ✕</button>
              ))}
            </div>
            <input type="hidden" name="skip_dates" value={skip.join(',')} />
          </div>

          <div className="text-muted" style={{ fontSize: 12.5 }}>
            {days.length === 0 ? 'Choose at least one weekday.'
              : !until ? 'Choose an end date to see how many days this fills.'
              : exp && exp.dates.length === 0 ? 'No matching days between those dates.'
              : exp && (
                <>Will create <strong style={{ color: 'inherit' }}>{exp.dates.length}</strong> task{exp.dates.length === 1 ? '' : 's'}
                  {minutes ? <> · {fmtH(minutes * exp.dates.length)} total</> : null}
                  {exp.dates.length > 0 && <> · {exp.dates[0]} → {exp.dates[exp.dates.length - 1]}</>}
                  {exp.skippedByHoliday > 0 && <> · {exp.skippedByHoliday} skipped</>}
                  {exp.truncated && <span style={{ color: 'var(--rose, #c0392b)' }}> · capped at {MAX_OCCURRENCES}; shorten the end date</span>}
                </>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
