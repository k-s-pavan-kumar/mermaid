/**
 * "Type it in plain words" parser. Deterministic and offline (no AI call, no
 * key, no cost), so it behaves the same every time. It only FILLS the form —
 * you still see and approve every field before anything is saved.
 *
 *   "UI UX class 9-10 every weekday till 31 oct skip 20 oct, 21 oct"
 *   "maths 6-7pm mon wed fri until 20 dec except 25 dec"
 *   "send invoice due friday"
 *   "review notes tomorrow 2-3"
 *
 * Dates are day-first (20/10 = 20 October). Times with no am/pm: 1–6 mean
 * afternoon, 7–12 mean morning.
 */
import { WEEKDAY_LABELS, isValidIso } from './recurrence';

export interface QuickParse {
  title: string;
  date: string | null;        // first day (or only day)
  start: string | null;       // 'HH:MM'
  end: string | null;
  repeat: boolean;
  weekdays: number[];
  until: string | null;
  skip: string[];
  due: string | null;
  notes: string[];            // things the person should double-check
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string) => { const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number) => iso(new Date(utc(s).getTime() + n * 86_400_000));
const dayIdx = (w: string) => DAYS.indexOf(w.slice(0, 3).toLowerCase());
const monIdx = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
const mkIso = (y: number, m: number, d: number) => { const s = `${y}-${pad(m + 1)}-${pad(d)}`; return isValidIso(s) ? s : null; };

/** Next date on/after `ref` with this month/day (rolls to next year if already past). */
function resolveMD(m: number, d: number, ref: string, year?: number): string | null {
  if (year) return mkIso(year, m, d);
  const y = Number(ref.slice(0, 4));
  const a = mkIso(y, m, d);
  if (a && a >= ref) return a;
  return mkIso(y + 1, m, d);
}

const DATE_SRC = [
  '(\\d{4}-\\d{2}-\\d{2})',                                                     // 1 iso
  `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON_RE})\\b(?:,?\\s+(\\d{4}))?`,           // 2,3,4  20 oct [2026]
  `\\b(${MON_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`,        // 5,6,7  oct 20 [2026]
  '(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?',                                      // 8,9,10 20/10[/26]
  `\\b(day after tomorrow|tomorrow|tmrw|tmr|today|tonight)\\b`,                 // 11
  `\\b(next\\s+|this\\s+)?(${DAY_RE})\\b`,                                      // 12,13
].join('|');

interface Found { index: number; len: number; iso: string }

function findDates(text: string, today: string, ref: string): Found[] {
  const out: Found[] = [];
  const re = new RegExp(DATE_SRC, 'gi');
  for (const m of text.matchAll(re)) {
    let r: string | null = null;
    if (m[1]) r = isValidIso(m[1]) ? m[1] : null;
    else if (m[2]) r = resolveMD(monIdx(m[3]!), Number(m[2]), ref, m[4] ? Number(m[4]) : undefined);
    else if (m[5]) r = resolveMD(monIdx(m[5]), Number(m[6]), ref, m[7] ? Number(m[7]) : undefined);
    else if (m[8]) {
      let y = m[10] ? Number(m[10]) : undefined;
      if (y !== undefined && y < 100) y += 2000;
      r = resolveMD(Number(m[9]) - 1, Number(m[8]), ref, y);
    } else if (m[11]) {
      const w = m[11].toLowerCase();
      r = w === 'day after tomorrow' ? plusDays(today, 2) : /^t(omorrow|mrw|mr)$/.test(w) ? plusDays(today, 1) : today;
    } else if (m[13]) {
      const want = dayIdx(m[13]);
      const cur = utc(ref).getUTCDay();
      let diff = (want - cur + 7) % 7;
      if (m[12] && /next/i.test(m[12]) && diff === 0) diff = 7;
      r = plusDays(ref, diff);
    }
    if (r) out.push({ index: m.index!, len: m[0].length, iso: r });
  }
  return out;
}

function to24(h: number, mer: string | undefined, isEnd: boolean, startH: number | null): number {
  if (mer) { const pm = mer.toLowerCase() === 'pm'; return (h % 12) + (pm ? 12 : 0); }
  if (isEnd && startH !== null) {
    // End with no am/pm: smallest reading that lands after the start.
    let c = h % 12; if (c < 1 && h === 12) c = 12;
    for (const cand of [h, h + 12, h % 12, (h % 12) + 12]) if (cand > startH && cand < 24) return cand;
    return h;
  }
  if (h >= 1 && h <= 6) return h + 12;   // "2-3" means afternoon
  return h;
}

export function parseQuickAdd(input: string, today: string): QuickParse {
  let s = ` ${input.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()} `;
  const notes: string[] = [];
  const cut = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(s);
    if (m) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return m;
  };

  // 1. Clauses that own their own dates — pulled out first so those dates
  //    are never mistaken for the start date.
  const STOP = '(?=\\s+(?:till|until|upto|through|thru|due|deadline|from|starting|every|daily|weekdays?|skip|except|excluding|ending|for|at)\\b|\\s*$)';
  const skipM = cut(new RegExp(`\\b(?:skip(?:ping)?|except(?:ing)?|excluding|holidays?(?:\\s+on)?|off\\s+on|no\\s+(?:class\\s+)?on|not\\s+on|without)\\s+(.+?)${STOP}`, 'i'));
  const dueM = cut(new RegExp(`\\b(?:due(?:\\s+(?:on|by))?|deadline(?:\\s+is)?|submit\\s+by)\\s+(.+?)${STOP}`, 'i'));
  const untilM = cut(new RegExp(`\\b(?:till|until|upto|up\\s+to|through|thru|ending(?:\\s+on)?|ends?(?:\\s+on)?)\\s+(.+?)${STOP}`, 'i'));
  const forM = cut(/\bfor\s+(\d+)\s*(day|week|month)s?\b/i);
  const thisMonth = cut(/\b(?:this\s+month|rest\s+of\s+(?:the\s+)?month|whole\s+month)\b/i);

  // 2. Duration ("for 2 hours") and time range ("9-10", "6:30pm to 8pm").
  let durationMin: number | null = null;
  const durM = cut(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i);
  if (durM) durationMin = Math.round(Number(durM[1]) * (/^h/i.test(durM[2]!) ? 60 : 1));

  let start: string | null = null, end: string | null = null;
  const timeM = cut(new RegExp(String.raw`\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?!\s*(?:/|:|${MON_RE}\b))`, 'i'));
  if (timeM) {
    const sh0 = Number(timeM[1]), eh0 = Number(timeM[4]);
    if (sh0 <= 24 && eh0 <= 24) {
      // "9-10pm": the one meridiem applies to both.
      const mer1 = timeM[3] ?? undefined, mer2 = timeM[6] ?? undefined;
      const sh = to24(sh0, mer1 ?? (mer2 && sh0 <= (eh0 % 12 || 12) ? mer2 : undefined), false, null);
      const eh = to24(eh0, mer2, true, sh);
      start = `${pad(sh)}:${timeM[2] ?? '00'}`;
      end = `${pad(Math.min(eh, 23))}:${timeM[5] ?? '00'}`;
    }
  } else {
    const atM = cut(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (atM) { start = `${pad(to24(Number(atM[1]), atM[3], false, null))}:${atM[2] ?? '00'}`; }
  }
  if (start && !end) {
    const [h = 0, mm = 0] = start.split(':').map(Number);
    const e = Math.min(23 * 60 + 30, h * 60 + mm + (durationMin ?? 60));
    end = `${pad(Math.floor(e / 60))}:${pad(e % 60)}`;
  }

  // 3. Repeat words.
  let repeat = false;
  let weekdays: number[] = [];
  if (cut(/\b(?:every\s*day|everyday|daily|all\s+days|7\s*days)\b/i)) { repeat = true; weekdays = [0, 1, 2, 3, 4, 5, 6]; }
  else if (cut(/\b(?:every\s+)?week\s*days?\b|\bmon(?:day)?\s*(?:-|to)\s*fri(?:day)?\b|\bmon-fri\b/i)) { repeat = true; weekdays = [1, 2, 3, 4, 5]; }
  else if (cut(/\bmon(?:day)?\s*(?:-|to)\s*sat(?:urday)?\b/i)) { repeat = true; weekdays = [1, 2, 3, 4, 5, 6]; }
  else {
    // "every mon wed fri", "every monday", "mon, wed and fri"
    const listM = cut(new RegExp(`\\b(?:every|each|on)?\\s*((?:${DAY_RE})(?:\\s*(?:,|and|&|\\s)\\s*(?:${DAY_RE}))+)\\b`, 'i'))
      ?? cut(new RegExp(`\\bevery\\s+(${DAY_RE})\\b`, 'i'));
    if (listM) {
      repeat = true;
      weekdays = [...new Set((listM[1]!.match(new RegExp(DAY_RE, 'gi')) ?? []).map(dayIdx))].filter((n) => n >= 0).sort();
    }
  }
  if (forM || thisMonth || untilM) repeat = repeat || !!(forM || untilM || thisMonth);
  if (repeat && weekdays.length === 0) weekdays = [1, 2, 3, 4, 5];
  if (/\bweekly\b/i.test(s)) { cut(/\bweekly\b/i); repeat = true; }

  // 4. Start date: first date-ish thing left, else today.
  s = s.replace(/\b(?:from|starting|starts?|on|beginning)\b(?=\s+(?:\d|today|tomorrow|tmr|tmrw|next|this|day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat))/gi, ' ');
  const startFound = findDates(s, today, today)[0];
  let date: string | null = null;
  if (startFound) {
    date = startFound.iso;
    s = s.slice(0, startFound.index) + ' ' + s.slice(startFound.index + startFound.len);
  } else if (start || repeat) {
    date = today;
  }
  const ref = date ?? today;

  // 5. Resolve the clause dates relative to the start.
  let until: string | null = null;
  const monthEnd = (r: string) => { const d = utc(r); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); };
  if (untilM) {
    const t = untilM[1]!;
    if (/month\s*end|end\s+of\s+(?:the\s+)?month|this\s+month/i.test(t)) until = monthEnd(ref);
    else until = findDates(` ${t} `, today, ref)[0]?.iso ?? null;
    if (!until) notes.push(`Couldn't read the end date "${t.trim()}"`);
  } else if (thisMonth) until = monthEnd(ref);
  else if (forM) {
    const n = Number(forM[1]); const unit = forM[2]!.toLowerCase();
    until = unit === 'day' ? plusDays(ref, n - 1) : unit === 'week' ? plusDays(ref, n * 7 - 1) : plusDays(ref, n * 30 - 1);
  }

  const skip: string[] = [];
  if (skipM) {
    const t = skipM[1]!;
    const dayNames = t.match(new RegExp(DAY_RE, 'gi')) ?? [];
    const hasWeekend = /\bweekends?\b/i.test(t);
    const rm = new Set<number>([...dayNames.map(dayIdx), ...(hasWeekend ? [0, 6] : [])]);
    // Weekday names / "weekends" -> drop those weekdays from the repeat.
    const dateText = t.replace(new RegExp(`\\b${DAY_RE}\\b|\\bweekends?\\b`, 'gi'), ' ');
    const found = findDates(` ${dateText} `, today, ref).map((f) => f.iso);
    skip.push(...new Set(found));
    if (rm.size) {
      if (!repeat) { repeat = !!until; weekdays = [0, 1, 2, 3, 4, 5, 6]; }
      weekdays = (weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6]).filter((d) => !rm.has(d));
    }
    if (skip.length === 0 && rm.size === 0) notes.push(`Couldn't read the skip dates "${t.trim()}"`);
    if (skip.length && !repeat) notes.push('Skip dates only matter when it repeats');
  }

  let due: string | null = null;
  if (dueM) {
    due = findDates(` ${dueM[1]} `, today, today)[0]?.iso ?? null;
    if (!due) notes.push(`Couldn't read the due date "${dueM[1]!.trim()}"`);
    else if (repeat) { notes.push('Due date ignored for repeating tasks'); due = null; }
  }

  if (repeat && !until) notes.push('Add an end date — repeats need one');
  if (repeat && weekdays.length === 0) notes.push('No weekdays left to repeat on');

  // 6. Whatever is left is the title.
  let title = s.replace(/\s+/g, ' ').trim();
  title = title.replace(/^(?:and|on|at|from|every|for|a|the)\s+/i, '').replace(/\s+(?:and|on|at|from|every|for|to|till|until|,|-)$/i, '').replace(/^[-,:;\s]+|[-,:;\s]+$/g, '').trim();
  if (!title) title = input.trim();

  return { title, date, start, end, repeat, weekdays, until, skip, due, notes };
}

export function describeQuickParse(q: QuickParse): string[] {
  const out: string[] = [];
  if (q.date) out.push(q.date);
  if (q.start && q.end) out.push(`${q.start}–${q.end}`);
  if (q.repeat) out.push(`repeats ${q.weekdays.length === 7 ? 'daily' : q.weekdays.map((d) => WEEKDAY_LABELS[d]).join(' ')}`);
  if (q.until) out.push(`until ${q.until}`);
  if (q.skip.length) out.push(`skip ${q.skip.join(', ')}`);
  if (q.due) out.push(`due ${q.due}`);
  return out;
}
