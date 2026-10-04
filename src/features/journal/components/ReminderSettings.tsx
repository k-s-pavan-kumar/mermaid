'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  DEFAULT_PREFS, EVERY_HOURS_OPTIONS, NEXT_DUE_KEY, PREFS_KEY, reminderBody, sanitizePrefs,
  type ReminderPrefs,
} from '../reminders';
import { permissionState, showJournalNotification, type PermissionState } from '../notify';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

export function ReminderSettings() {
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [perm, setPerm] = useState<PermissionState>('default');
  const [ready, setReady] = useState(false);

  // Read storage after mount — rendering it on the server would mismatch.
  useEffect(() => {
    try { setPrefs(sanitizePrefs(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null'))); } catch { /* defaults */ }
    setPerm(permissionState());
    setReady(true);
  }, []);

  function save(next: ReminderPrefs, restartClock = false) {
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      // A new interval or a fresh "on" restarts the countdown from now.
      if (restartClock) window.localStorage.setItem(NEXT_DUE_KEY, String(Date.now() + next.everyHours * 3_600_000));
    } catch { /* storage blocked */ }
  }

  async function turnOn() {
    let p = permissionState();
    if (p === 'default') {
      p = (await Notification.requestPermission()) as PermissionState;
      setPerm(p);
    }
    if (p !== 'granted') {
      toast(p === 'denied' ? 'Notifications are blocked for this site' : 'Notifications aren’t available here', 'error',
        p === 'denied' ? 'Allow them from the lock icon in the address bar, then try again.' : 'They need https or localhost.');
      return;
    }
    save({ ...prefs, enabled: true }, true);
    toast('Journal reminders on', 'success', `Every ${prefs.everyHours}h, ${hourLabel(prefs.startHour)} – ${hourLabel(prefs.endHour)}`);
  }

  async function sendTest() {
    const ok = await showJournalNotification(reminderBody(0));
    toast(ok ? 'Test sent' : 'Couldn’t show a notification', ok ? 'info' : 'error',
      ok ? 'If you don’t see it, check Focus assist / Do Not Disturb.' : undefined);
  }

  if (!ready) return <div className="card journal-reminders"><div className="text-muted text-sm">Loading…</div></div>;

  const on = prefs.enabled && perm === 'granted';

  return (
    <div className="card journal-reminders">
      <h3>
        Reminders
        <span className={`journal-pill ${on ? 'on' : ''}`}>{on ? 'On' : 'Off'}</span>
      </h3>

      {perm === 'unsupported' && (
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          This browser context can’t show notifications (they need https or <code>localhost</code>).
        </p>
      )}
      {perm === 'denied' && (
        <p className="text-sm" style={{ marginTop: 0, color: 'var(--crimson)' }}>
          Notifications are blocked for this site. Allow them from the lock icon in the address bar.
        </p>
      )}

      <div className="journal-field">
        <label htmlFor="jr-every">Remind me every</label>
        <select id="jr-every" value={prefs.everyHours} onChange={(e) => save({ ...prefs, everyHours: Number(e.target.value) }, true)}>
          {EVERY_HOURS_OPTIONS.map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
        </select>
      </div>

      <div className="journal-field">
        <label htmlFor="jr-start">Only between</label>
        <span className="journal-range">
          <select id="jr-start" aria-label="From" value={prefs.startHour} onChange={(e) => save({ ...prefs, startHour: Number(e.target.value) })}>
            {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <span className="text-muted">and</span>
          <select aria-label="Until" value={prefs.endHour} onChange={(e) => save({ ...prefs, endHour: Number(e.target.value) })}>
            {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </span>
      </div>

      <label className="journal-check">
        <input type="checkbox" checked={prefs.skipIfRecent} onChange={(e) => save({ ...prefs, skipIfRecent: e.target.checked })} />
        <span>Skip it if I’ve already written something in that time</span>
      </label>

      <div className="journal-actions">
        {on ? (
          <button className="btn-ghost" onClick={() => save({ ...prefs, enabled: false })}>Turn off</button>
        ) : (
          <button className="btn" onClick={turnOn} disabled={perm === 'unsupported'}>Turn on reminders</button>
        )}
        <button className="btn-ghost" onClick={sendTest} disabled={perm !== 'granted'}>Send a test</button>
      </div>

      <details className="journal-help">
        <summary>When Meridian isn’t open</summary>
        <p>
          These reminders run inside the browser, so they only fire while Meridian is open in a tab or
          installed-app window. To get a desktop notification even when it’s closed, install the small
          desktop helper once (from the project folder):
        </p>
        <pre>npm run journal:remind:install -- --every {prefs.everyHours}</pre>
        <p>Remove it any time with <code>npm run journal:remind:uninstall</code>.</p>
      </details>
    </div>
  );
}
