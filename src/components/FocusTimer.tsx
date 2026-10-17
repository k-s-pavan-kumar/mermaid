'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const PRESETS = [25, 15, 50, 5];

/**
 * Focus timer that records what it was for.
 *
 * Two deliberate choices: you name the thing before starting (a timer with
 * no subject is a timer you drift away from), and stopping early still logs
 * the minutes you did. Half a session recorded beats a whole session lost,
 * and the day view later has to answer "where did the time go" for days
 * where nothing got ticked off.
 */
export function FocusTimer({
  tasks = [],
  logSession,
}: {
  tasks?: { id: string; title: string; project_id: string | null }[];
  logSession?: (input: {
    minutes: number;
    completedMinutes: number;
    taskId?: string | null;
    projectId?: string | null;
    note?: string | null;
  }) => Promise<void>;
}) {
  const router = useRouter();
  const [totalMin, setTotalMin] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [logged, setLogged] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  async function save(completedSeconds: number) {
    const minutes = Math.round(completedSeconds / 60);
    if (!logSession || minutes < 1) return;
    const task = tasks.find((t) => t.id === taskId);
    await logSession({
      minutes: totalMin,
      completedMinutes: minutes,
      taskId: taskId || null,
      projectId: task?.project_id ?? null,
    });
    setLogged(`${minutes} min logged${task ? ` on "${task.title}"` : ''}`);
    router.refresh();
  }

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          const done = elapsedRef.current;
          elapsedRef.current = 0;
          void save(done);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function pick(min: number) {
    setRunning(false);
    elapsedRef.current = 0;
    setTotalMin(min);
    setSeconds(min * 60);
    setLogged(null);
  }

  function stopEarly() {
    setRunning(false);
    const done = elapsedRef.current;
    elapsedRef.current = 0;
    setSeconds(totalMin * 60);
    void save(done);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="card focus">
      <img src="/mascot/timer.png" alt="" width={72} height={72} />
      <div className="focus-label">Focus timer — for when starting is the hard part</div>

      {tasks.length > 0 && (
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="focus-task"
          aria-label="What are you working on?"
        >
          <option value="">What are you working on?</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      )}

      <div className="focus-time">{mm}:{ss}</div>

      <div className="focus-btns" style={{ marginBottom: 10 }}>
        <button className="btn-inline" onClick={() => { setLogged(null); setRunning((r) => !r); }}>
          {running ? 'Pause' : seconds === totalMin * 60 ? 'Start' : 'Resume'}
        </button>
        <button className="btn-ghost" onClick={stopEarly}>
          {elapsedRef.current > 0 || seconds < totalMin * 60 ? 'Stop & log' : 'Reset'}
        </button>
      </div>

      <div className="focus-btns">
        {PRESETS.map((m) => (
          <button
            key={m}
            className="btn-ghost"
            onClick={() => pick(m)}
            style={totalMin === m ? { borderColor: 'var(--pine)', color: 'var(--pine)', fontWeight: 600 } : undefined}
          >
            {m}m
          </button>
        ))}
      </div>

      {logged && <div className="focus-logged">✓ {logged}</div>}
      <div className="text-muted" style={{ fontSize: 10.5, marginTop: 8 }}>
        Stopping early still logs the minutes you did.
      </div>
    </div>
  );
}
