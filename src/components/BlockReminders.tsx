'use client';

import { useEffect } from 'react';
import { permissionState } from '@/features/journal/notify';
import { showTaskNotification } from '@/features/today/notify';

// Renders nothing. Mounted once in <Shell>. While Meridian is open in a tab
// or an installed-app window it nudges you 10 minutes before a timed block,
// again when it starts, and once each morning if a deadline lands today.
// Needs notification permission (the "Remind me" button on the Today card).

interface Upcoming {
  today: string;
  blocks: { id: string; title: string; start: number; end: number }[];
  dueToday: { id: string; title: string }[];
}

const seen = (k: string) => { try { return window.localStorage.getItem(k) !== null; } catch { return false; } };
const mark = (k: string) => { try { window.localStorage.setItem(k, '1'); } catch { /* storage blocked */ } };
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function BlockReminders() {
  useEffect(() => {
    let data: Upcoming | null = null;

    async function load() {
      if (permissionState() !== 'granted') return;
      try {
        const res = await fetch('/api/today/upcoming', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok || res.redirected || !(res.headers.get('content-type') ?? '').includes('json')) { data = null; return; }
        data = (await res.json()) as Upcoming;
      } catch { /* offline — keep the last list */ }
    }

    async function tick() {
      if (!data || permissionState() !== 'granted') return;
      // Only trust the minute-of-day if the browser and the home timezone agree on the date.
      if (data.today !== localDate()) return;
      const d = new Date();
      const now = d.getHours() * 60 + d.getMinutes();

      for (const b of data.blocks) {
        const until = b.start - now;
        const pre = `meridian-blk:${data.today}:${b.id}:pre`;
        const at = `meridian-blk:${data.today}:${b.id}:at`;
        if (until > 0 && until <= 10 && !seen(pre)) {
          mark(pre);
          await showTaskNotification(`${b.title} starts in ${until} min`, 'Open it and tap Start — even 5 minutes counts.', `meridian-blk-${b.id}`);
        } else if (until <= 0 && now < Math.min(b.end, b.start + 10) && !seen(at)) {
          mark(at);
          await showTaskNotification(`Time for: ${b.title}`, "It's start time. Tap to open and begin.", `meridian-blk-${b.id}`);
        }
      }

      const dueKey = `meridian-blk:${data.today}:due`;
      if (data.dueToday.length > 0 && now >= 8 * 60 && !seen(dueKey)) {
        mark(dueKey);
        const n = data.dueToday.length;
        await showTaskNotification(
          `${n} deadline${n === 1 ? '' : 's'} today`,
          data.dueToday.slice(0, 3).map((t) => t.title).join(' · '),
          'meridian-blk-due',
        );
      }
    }

    void load().then(tick);
    const t1 = setInterval(() => void tick(), 30_000);
    const t2 = setInterval(() => void load(), 5 * 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  return null;
}
