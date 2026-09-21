import type { DayBlock, DayBlockKind } from './types';
import { fmtClock } from './time';

/**
 * Pure helpers for sleep / travel / office blocks — shared by the server
 * actions, the Today grid and the day summary, so "which part of this block
 * falls on this day" is decided in exactly one place.
 */

export const DAY_MIN = 1440;
/** Longest single block accepted. Catches swapped AM/PM before it becomes a 19-hour "sleep". */
export const MAX_BLOCK_MIN = 16 * 60;

export const DAY_BLOCK_META: Record<DayBlockKind, { label: string; emoji: string; color: string }> = {
  sleep: { label: 'Sleep', emoji: '😴', color: '#7b82e0' },
  office: { label: 'Office', emoji: '🏢', color: '#2f9e8f' },
  travel: { label: 'Travel', emoji: '🚗', color: '#e0912f' },
};

/** Calendar-day arithmetic in UTC (see shiftDate in TodayClient for why). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** "07:30" -> 450. Null when it isn't a valid 24-hour time. */
export function parseHHMM(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 450 -> "07:30", the shape <input type="time"> wants. */
export function minutesToHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Length between two clock times, treating "to" earlier than "from" as the
 * next day — which is what makes 11:30 PM → 6:30 AM come out as 7h. Null when
 * the two are identical or the span is implausibly long.
 */
export function spanMinutes(from: number, to: number): number | null {
  const d = to > from ? to - from : DAY_MIN - from + to;
  return to === from || d < 1 || d > MAX_BLOCK_MIN ? null : d;
}

/** The date the block ends on (the "wake" date for a sleep block). */
export function endDate(b: Pick<DayBlock, 'date' | 'start_minute' | 'duration_minutes'>): string {
  return addDays(b.date, Math.floor((b.start_minute + b.duration_minutes - 1) / DAY_MIN));
}

export interface DaySegment {
  block: DayBlock;
  kind: DayBlockKind;
  /** Minutes from midnight of the day being viewed. */
  startMin: number;
  endMin: number;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
}

/** The part of each block that falls on `date` — including the tail of last
 *  night's sleep, which started the day before. */
export function segmentsForDay(blocks: DayBlock[], date: string): DaySegment[] {
  const prev = addDays(date, -1);
  const out: DaySegment[] = [];
  for (const b of blocks) {
    const end = b.start_minute + b.duration_minutes;
    if (b.date === date) {
      out.push({ block: b, kind: b.kind, startMin: b.start_minute, endMin: Math.min(end, DAY_MIN), continuesFromPrev: false, continuesToNext: end > DAY_MIN });
    } else if (b.date === prev && end > DAY_MIN) {
      out.push({ block: b, kind: b.kind, startMin: 0, endMin: end - DAY_MIN, continuesFromPrev: true, continuesToNext: false });
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** The night's sleep that ended (i.e. you woke up) on `date`. Longest wins if
 *  more than one was logged. */
export function sleepEndingOn(blocks: DayBlock[], date: string): DayBlock | null {
  const nights = blocks.filter((b) => b.kind === 'sleep' && endDate(b) === date);
  if (nights.length === 0) return null;
  return nights.reduce((best, b) => (b.duration_minutes > best.duration_minutes ? b : best));
}

/** Minutes covered by a kind's segments on this day, overlaps counted once. */
function unionMinutes(segs: DaySegment[], kind: DayBlockKind): number {
  const bits = new Uint8Array(DAY_MIN);
  for (const s of segs) {
    if (s.kind !== kind) continue;
    for (let m = s.startMin; m < s.endMin; m++) bits[m] = 1;
  }
  let n = 0;
  for (let m = 0; m < DAY_MIN; m++) n += bits[m]!;
  return n;
}

export interface DaySummary {
  /** The full night that ended today (not just the part after midnight). */
  sleep: number;
  office: number;
  travel: number;
}

export function daySummary(blocks: DayBlock[], date: string): DaySummary {
  const segs = segmentsForDay(blocks, date);
  return {
    sleep: sleepEndingOn(blocks, date)?.duration_minutes ?? 0,
    office: unionMinutes(segs, 'office'),
    travel: unionMinutes(segs, 'travel'),
  };
}

/** Side-by-side columns for segments that overlap in time (say, a commute
 *  that starts before office time is over), so none is hidden behind another. */
export function assignColumns(segs: DaySegment[]): { seg: DaySegment; col: number; cols: number }[] {
  const colEnds: number[] = [];
  const placed = segs.map((seg) => {
    let col = colEnds.findIndex((end) => end <= seg.startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(seg.endMin); } else colEnds[col] = seg.endMin;
    return { seg, col };
  });
  const cols = Math.max(1, colEnds.length);
  return placed.map((p) => ({ ...p, cols }));
}

/** "11:30 PM → 6:30 AM" for a block, straight from its stored start/length. */
export function blockRangeLabel(b: Pick<DayBlock, 'start_minute' | 'duration_minutes'>): string {
  return `${fmtClock(b.start_minute)} → ${fmtClock(b.start_minute + b.duration_minutes)}`;
}
