'use client';

import { useEffect, useState } from 'react';
import type { ClockWidget } from '@/features/settings/types';

function fmt(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(now);
  } catch {
    return '--:--';
  }
}

/** Day offset relative to home, so "tomorrow already" is obvious at a glance. */
function dayDelta(tz: string, homeTz: string, now: Date): string {
  try {
    const d = (z: string) => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const a = d(tz);
    const b = d(homeTz);
    if (a === b) return '';
    return a > b ? '+1d' : '−1d';
  } catch {
    return '';
  }
}

/** Rough working-hours read on the other end — the thing you actually want
 *  to know before pinging a client. */
function awake(tz: string, now: Date): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(now));
    return hour >= 9 && hour < 19;
  } catch {
    return true;
  }
}

// Renders placeholder times until mounted so server and client markup match —
// otherwise the first paint differs from the SSR output and React logs a
// hydration mismatch.
export function ClockStrip({ clocks }: { clocks: ClockWidget[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  if (clocks.length === 0) return null;
  const home = clocks.find((c) => c.home) ?? clocks[0]!;

  return (
    <div className="clockstrip">
      {clocks.map((z) => {
        const off = now ? dayDelta(z.timezone, home.timezone, now) : '';
        return (
          <div key={z.id} className={`clock${now && !awake(z.timezone, now) ? ' asleep' : ''}`} title={z.timezone}>
            <div className="city"><b>{z.label}</b></div>
            <div className="time mono">{now ? fmt(z.timezone, now) : '--:--'}</div>
            {off && <span className="day-off">{off}</span>}
            {z.home && <span className="badge-home">home base</span>}
          </div>
        );
      })}
      <a href="/settings" className="clock-edit" title="Customise clocks">edit</a>
    </div>
  );
}
