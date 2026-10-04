// In-browser journal reminders — the pure scheduling rules. No DOM access
// here (the engine in components/JournalReminders.tsx does that), so the
// rules can be tested in plain Node by scripts/verify-journal.ts.
//
// Preferences live in localStorage on purpose: notification permission is
// granted per browser, so "reminders on" is genuinely a per-device setting.

export interface ReminderPrefs {
  enabled: boolean;
  /** Hours between reminders. */
  everyHours: number;
  /** Local hour (0–23) the window opens. Reminders never fire before it. */
  startHour: number;
  /** Local hour (0–23) the window closes. If <= startHour the window wraps midnight. */
  endHour: number;
  /** Don't remind if you already wrote something within the last `everyHours`. */
  skipIfRecent: boolean;
}

export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: false,
  everyHours: 3,
  startHour: 9,
  endHour: 21,
  skipIfRecent: true,
};

export const EVERY_HOURS_OPTIONS = [1, 2, 3, 4, 6] as const;

export const PREFS_KEY = 'meridian:journal-reminder:prefs';
export const NEXT_DUE_KEY = 'meridian:journal-reminder:next-due';
export const COUNT_KEY = 'meridian:journal-reminder:count';

const HOUR_MS = 3_600_000;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Whatever is in storage (or nothing, or garbage) → a valid ReminderPrefs. */
export function sanitizePrefs(raw: unknown): ReminderPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    everyHours: clampInt(r.everyHours, 1, 24, DEFAULT_PREFS.everyHours),
    startHour: clampInt(r.startHour, 0, 23, DEFAULT_PREFS.startHour),
    endHour: clampInt(r.endHour, 0, 23, DEFAULT_PREFS.endHour),
    skipIfRecent: r.skipIfRecent === undefined ? DEFAULT_PREFS.skipIfRecent : r.skipIfRecent === true,
  };
}

/** Is `date` (read in the machine's local time) inside the reminder window? */
export function inActiveWindow(date: Date, p: Pick<ReminderPrefs, 'startHour' | 'endHour'>): boolean {
  const h = date.getHours();
  if (p.startHour === p.endHour) return true; // equal bounds = all day
  return p.startHour < p.endHour ? h >= p.startHour && h < p.endHour : h >= p.startHour || h < p.endHour;
}

/** Due = reminders on, a schedule exists, its time has come, and we're inside the window.
 *  Outside the window a due reminder simply waits and fires when the window opens. */
export function isDue(nowMs: number, nextDueAt: number | null, p: ReminderPrefs): boolean {
  if (!p.enabled || nextDueAt === null) return false;
  return nowMs >= nextDueAt && inActiveWindow(new Date(nowMs), p);
}

/** Once a reminder is due: fire it, or push it back because you just wrote something. */
export function afterDueCheck(
  nowMs: number,
  lastActivityMs: number | null,
  p: ReminderPrefs,
): { fire: boolean; nextDueAt: number } {
  const interval = p.everyHours * HOUR_MS;
  if (p.skipIfRecent && lastActivityMs !== null && nowMs - lastActivityMs < interval) {
    return { fire: false, nextDueAt: lastActivityMs + interval };
  }
  return { fire: true, nextDueAt: nowMs + interval };
}

/** A small rotation so the nudge doesn't read identically eight times a day. */
const PROMPTS = [
  'What’s on your mind? Dump it here before it slips.',
  'Any wins, worries or half-ideas since your last note?',
  'Two minutes: what did you just finish, and what’s nagging you?',
  'Get it out of your head and into the journal.',
];
export function reminderBody(count: number): string {
  return PROMPTS[((count % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]!;
}
