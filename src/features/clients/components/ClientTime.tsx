'use client';

import { useEffect, useState } from 'react';

function fmt(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date());
  } catch {
    return '--:--';
  }
}

// Rough "comfortable overlap" estimate: hours where both IST (9am-9pm) and
// the client's local time (9am-9pm) are both in a normal working window,
// on today's date. Good enough for at-a-glance scheduling; not DST-precise.
function overlapHours(tz: string): number {
  let count = 0;
  const now = new Date();
  for (let h = 0; h < 24; h++) {
    const probe = new Date(now);
    probe.setUTCHours(h, 0, 0, 0);
    const istHour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(probe)
    );
    let clientHour: number;
    try {
      clientHour = Number(
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(probe)
      );
    } catch {
      return 0;
    }
    if (istHour >= 9 && istHour <= 21 && clientHour >= 9 && clientHour <= 21) count++;
  }
  return count;
}

export function ClientTime({ timezone }: { timezone: string }) {
  const [time, setTime] = useState(() => fmt(timezone));

  useEffect(() => {
    const id = setInterval(() => setTime(fmt(timezone)), 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  const overlap = overlapHours(timezone);
  const color = overlap >= 5 ? 'var(--sage)' : overlap >= 2 ? 'var(--gold)' : 'var(--crimson)';

  return (
    <span style={{ fontSize: 13 }}>
      <strong>{time}</strong> local ({timezone}) ·{' '}
      <span style={{ color }}>{overlap}h overlap with IST</span>
    </span>
  );
}
