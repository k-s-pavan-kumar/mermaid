'use client';

import { useEffect, useState } from 'react';
import { URGENCY_COLOR, urgencyOf } from '../urgency';

/** "due tomorrow" / "due today · 5h 12m left" / "2d overdue", coloured by urgency. */
export function DueBadge({ due, today }: { due: string; today: string }) {
  // Minutes-left only exists on the client (and ticks), so the server render
  // shows the plain label and hydration can't mismatch.
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    const tick = () => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const u = urgencyOf(due, today, now);
  const color = URGENCY_COLOR[u.level];
  const hot = u.level === 'overdue' || u.level === 'today';
  return (
    <span
      title={`Deadline ${due}`}
      style={{
        fontSize: 10.5, fontWeight: 600, color, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
        border: `1px solid ${color}`, background: hot ? `${color}14` : 'transparent', flexShrink: 0,
      }}
    >
      {u.label}
    </span>
  );
}
