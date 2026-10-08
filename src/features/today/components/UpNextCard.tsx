'use client';

import { useEffect, useState } from 'react';
import type { Task } from '../types';
import { fmtClock, fmtRange, startMinutes } from '../time';
import { pickUpNext, type UpNextPick } from '../upnext';
import { DueBadge } from './DueBadge';
import { ActionButton } from '@/components/ActionButton';
import { permissionState } from '@/features/journal/notify';

/**
 * The "just start" card. One task, one big button. Start launches the focus
 * timer already pointed at it; "Just 5 minutes" is the low-effort way in —
 * starting is the hard part, so the card lowers the bar instead of asking
 * you to decide anything.
 */
export function UpNextCard({
  todayTasks, dueSoon, dump, oneThingId, today, onStart, markDone,
}: {
  todayTasks: Task[];
  dueSoon: Task[];
  dump: Task[];
  oneThingId: string | null;
  today: string;
  onStart: (task: Task, minutes: number) => void;
  markDone: (id: string) => Promise<void>;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [perm, setPerm] = useState<string>('unsupported');
  useEffect(() => {
    const tick = () => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); };
    tick();
    setPerm(permissionState());
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null; // client-only clock — avoids a hydration mismatch
  const pick: UpNextPick | null = pickUpNext({ todayTasks, dueSoon, dump, oneThingId, nowMinutes: now });

  async function enableReminders() {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
    setPerm(permissionState());
  }

  if (!pick) {
    return (
      <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
        <strong>Nothing waiting.</strong> <span className="text-muted">Add a task in the brain dump below when something comes up.</span>
      </div>
    );
  }

  const { task, kind, minutes } = pick;
  const t = task;
  const scheduled = t.scheduled_hour !== null && t.scheduled_hour !== undefined;
  const heading =
    kind === 'now' ? `Right now · ${minutes} min left in this block`
    : kind === 'one-thing' ? 'Your one thing today'
    : kind === 'next' ? `Next up · starts in ${minutes! >= 60 ? `${Math.floor(minutes! / 60)}h ${minutes! % 60}m` : `${minutes} min`}`
    : kind === 'missed' ? `Planned for ${fmtClock(startMinutes(t))} — still open`
    : kind === 'due' ? 'Closest deadline'
    : 'Nothing scheduled — pick something small';
  const full = kind === 'now' ? Math.max(5, Math.min(25, minutes!)) : 25;

  return (
    <div className="card" style={{ marginBottom: 14, padding: '16px 20px', borderLeft: '4px solid var(--accent, #5b3fd6)' }}>
      <div className="text-muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{heading}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '6px 0 12px' }}>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600 }}>{t.title}</span>
        {scheduled && <span className="text-muted" style={{ fontSize: 12.5 }}>{fmtRange(t)}</span>}
        {t.due_date && <DueBadge due={t.due_date} today={today} />}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-inline" style={{ fontSize: 15, padding: '9px 20px' }} onClick={() => onStart(t, full)}>
          ▶ Start {full} min
        </button>
        <button type="button" className="btn-ghost" onClick={() => onStart(t, 5)} title="Five minutes. You can stop after that.">
          Just 5 minutes
        </button>
        <ActionButton action={() => markDone(t.id)} className="btn-ghost" pendingLabel="…">Already done</ActionButton>
        {perm === 'default' && (
          <button type="button" className="btn-link" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={enableReminders}>
            🔔 Remind me before each block
          </button>
        )}
        {perm === 'granted' && <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>🔔 block reminders on</span>}
      </div>
    </div>
  );
}
