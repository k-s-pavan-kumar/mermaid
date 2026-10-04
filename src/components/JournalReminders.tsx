'use client';

import { useEffect } from 'react';
import {
  NEXT_DUE_KEY, COUNT_KEY, PREFS_KEY, afterDueCheck, isDue, reminderBody, sanitizePrefs,
  type ReminderPrefs,
} from '@/features/journal/reminders';
import { permissionState, showJournalNotification } from '@/features/journal/notify';

// Renders nothing. Mounted once in <Shell>, so it keeps ticking on every page
// for as long as Meridian is open in a tab or an installed-app window.
// It cannot fire when the browser is closed — that's the job of the desktop
// helper (scripts/journal-reminder.js).

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked — reminders just won't persist */ }
}

function loadPrefs(): ReminderPrefs {
  try { return sanitizePrefs(JSON.parse(read(PREFS_KEY) ?? 'null')); } catch { return sanitizePrefs(null); }
}

/** Ask the server when you last wrote. null = never wrote OR couldn't tell;
 *  'signed-out' = the request bounced to the login page, so stay quiet. */
async function fetchLastActivity(): Promise<number | null | 'signed-out'> {
  try {
    const res = await fetch('/api/journal/last', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok || res.redirected || !(res.headers.get('content-type') ?? '').includes('json')) return 'signed-out';
    const { last } = (await res.json()) as { last: string | null };
    return last ? Date.parse(last) : null;
  } catch {
    return null; // offline: better to nudge than to go silent
  }
}

export function JournalReminders() {
  useEffect(() => {
    let running = false;

    async function tick() {
      if (running) return;
      const prefs = loadPrefs();
      if (!prefs.enabled || permissionState() !== 'granted') return;

      const now = Date.now();
      const stored = Number(read(NEXT_DUE_KEY));
      let nextDueAt = Number.isFinite(stored) && stored > 0 ? stored : null;

      // First tick after turning reminders on: start the clock, don't fire.
      if (nextDueAt === null) {
        write(NEXT_DUE_KEY, String(now + prefs.everyHours * 3_600_000));
        return;
      }
      if (!isDue(now, nextDueAt, prefs)) return;

      running = true;
      try {
        // Claim this slot for a minute before any network call so a second
        // open tab doesn't fire the same reminder.
        write(NEXT_DUE_KEY, String(now + 60_000));

        let lastActivity: number | null = null;
        if (prefs.skipIfRecent) {
          const res = await fetchLastActivity();
          if (res === 'signed-out') { write(NEXT_DUE_KEY, String(now + prefs.everyHours * 3_600_000)); return; }
          lastActivity = res;
        }

        const decision = afterDueCheck(now, lastActivity, prefs);
        write(NEXT_DUE_KEY, String(decision.nextDueAt));
        if (!decision.fire) return;

        const count = Number(read(COUNT_KEY)) || 0;
        write(COUNT_KEY, String(count + 1));
        await showJournalNotification(reminderBody(count));
      } finally {
        running = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 60_000);
    const onWake = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return null;
}
