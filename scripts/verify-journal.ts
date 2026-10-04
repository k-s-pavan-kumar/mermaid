// npm run verify:journal
//
// Covers the Journal feature end to end below the UI: date/grouping/search
// logic, the data-layer queries (owner isolation, missing-table tolerance),
// the in-browser reminder rules, and the desktop helper's decision logic and
// OS-specific generators.
//
// Unlike the other verify scripts this one never touches data/db.local.json:
// it runs inside a temp directory, because local-store resolves its file from
// process.cwd() at import time (hence the dynamic imports after chdir).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-journal-'));
fs.mkdirSync(path.join(tmp, 'data'));
process.chdir(tmp);

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; process.exitCode = 1; } else console.log('ok  :', msg);
}
function eq<T>(actual: T, expected: T, msg: string) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) console.error(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  assert(same, msg);
}

const EMPTY_DB = {
  clients: [], projects: [], project_phases: [], quotes: [], invoices: [], bounty_submissions: [],
  project_metrics: [], milestones: [], notes: [], tasks: [], integrations: [], alert_states: [],
  meetings: [], settings: [], focus_sessions: [], targets_history: [], finance_entries: [],
  finance_categories: [], finance_category_rules: [], finance_obligations: [], bounty_cases: [],
  needs: [], courses: [], tracked_packages: [], metric_snapshots: [], project_status_log: [],
};

async function main() {
  const logic = await import(path.join(ROOT, 'src/features/journal/logic'));
  const rem = await import(path.join(ROOT, 'src/features/journal/reminders'));
  const tzmod = await import(path.join(ROOT, 'src/lib/tz/today'));
  const store = await import(path.join(ROOT, 'src/lib/data/local-store'));
  const queries = await import(path.join(ROOT, 'src/features/journal/queries'));
  type Entry = import('../src/features/journal/types').JournalEntry;

  // ---------------------------------------------------------------- dates ---
  console.log('\n-- dates');
  assert(logic.isRealIsoDate('2026-10-03'), 'accepts a real date');
  assert(logic.isRealIsoDate('2028-02-29'), 'accepts 29 Feb in a leap year');
  assert(!logic.isRealIsoDate('2026-02-29'), 'rejects 29 Feb in a non-leap year');
  assert(!logic.isRealIsoDate('2026-02-30'), 'rejects 30 Feb (right shape, not a date)');
  assert(!logic.isRealIsoDate('2026-13-01'), 'rejects month 13');
  assert(!logic.isRealIsoDate('03-10-2026') && !logic.isRealIsoDate('') && !logic.isRealIsoDate('abc'), 'rejects wrong shapes');
  eq(logic.parseDateParam('2026-09-01', '2026-10-03'), '2026-09-01', 'parseDateParam keeps a valid date');
  eq(logic.parseDateParam('nonsense', '2026-10-03'), '2026-10-03', 'parseDateParam falls back on junk');
  eq(logic.parseDateParam(undefined, '2026-10-03'), '2026-10-03', 'parseDateParam falls back on undefined');
  eq(logic.parseDateParam(['2026-09-01'], '2026-10-03'), '2026-10-03', 'parseDateParam ignores a repeated (array) param');
  eq(logic.parseDateParam('  2026-09-01 ', '2026-10-03'), '2026-09-01', 'parseDateParam trims whitespace');

  eq(logic.formatDayLabel('2026-10-03', '2026-10-03'), 'Today', 'label: Today');
  eq(logic.formatDayLabel('2026-10-02', '2026-10-03'), 'Yesterday', 'label: Yesterday');
  eq(logic.formatDayLabel('2026-10-04', '2026-10-03'), 'Tomorrow', 'label: Tomorrow');
  eq(logic.formatDayLabel('2026-09-28', '2026-10-03'), 'Mon, 28 Sept 2026', 'label: other day shows weekday + date');
  eq(logic.formatDayLabel('2026-03-01', '2026-02-28'), 'Tomorrow', 'label: month boundary counts days, not strings');

  // The reason "day-wise" uses the home timezone, not UTC:
  // 19:00Z on 3 Oct is 00:30 IST on 4 Oct, so a note written then belongs to the 4th.
  const lateNight = new Date('2026-10-03T19:00:00Z');
  eq(tzmod.isoDateIn(lateNight, 'Asia/Kolkata'), '2026-10-04', 'a 00:30 IST note files under the IST day, not UTC\'s');
  eq(tzmod.isoDateIn(lateNight, 'UTC'), '2026-10-03', '...whereas UTC would have called it the previous day');
  eq(logic.formatEntryTime('2026-10-03T19:00:00Z', 'Asia/Kolkata'), '12:30 am', 'entry time renders in the given timezone');
  eq(logic.formatEntryTime('2026-10-03T09:45:00Z', 'Asia/Kolkata'), '3:15 pm', 'afternoon time renders with pm');

  // ------------------------------------------------- grouping and search ---
  console.log('\n-- grouping, search, activity');
  const mk = (id: string, date: string, created: string, content: string, updated = created, owner = 'a@x.com'): Entry =>
    ({ id, owner_id: owner, entry_date: date, content, created_at: created, updated_at: updated });

  const sample: Entry[] = [
    mk('1', '2026-10-01', '2026-10-01T04:00:00.000Z', 'First thought\nsecond line'),
    mk('2', '2026-10-01', '2026-10-01T09:00:00.000Z', '\n\nLatest on the 1st is a deliberately long first line that must be truncated for the rail'),
    mk('3', '2026-10-03', '2026-10-03T05:00:00.000Z', 'Call the Bank about the invoice'),
    mk('4', '2026-09-20', '2026-09-20T05:00:00.000Z', 'Old one'),
  ];
  const days = logic.summariseDays(sample);
  eq(days.map((d: any) => d.date), ['2026-10-03', '2026-10-01', '2026-09-20'], 'days sort newest first');
  eq(days.map((d: any) => d.count), [1, 2, 1], 'counts entries per day');
  assert(days[1].preview.startsWith('Latest on the 1st') && days[1].preview.endsWith('…') && days[1].preview.length === 58,
    'preview = first non-blank line of the most recent entry, truncated to 57 chars + ellipsis');
  eq(logic.summariseDays(sample, 2).length, 2, 'limit caps the number of days');
  eq(logic.summariseDays([]), [], 'no entries → no days');

  assert(logic.matchesQuery('Call the Bank about the invoice', 'bank invoice'), 'search: all words must appear, any order, any case');
  assert(!logic.matchesQuery('Call the Bank about the invoice', 'bank refund'), 'search: a missing word means no match');
  assert(!logic.matchesQuery('anything', '   '), 'search: blank query matches nothing (rather than everything)');

  eq(logic.latestActivity([]), null, 'latestActivity: none → null');
  eq(logic.latestActivity(sample), '2026-10-03T05:00:00.000Z', 'latestActivity: newest create');
  eq(logic.latestActivity([...sample, mk('5', '2026-09-20', '2026-09-20T05:00:00.000Z', 'edited', '2026-10-05T08:00:00.000Z')]),
    '2026-10-05T08:00:00.000Z', 'latestActivity: an edit counts as activity');

  // ------------------------------------------------------- data layer -------
  console.log('\n-- data layer (temp database)');
  // An older db.local.json that predates the journal has no journal_entries key at all.
  store.writeDb({ ...EMPTY_DB } as any);
  eq(await queries.getEntriesForDate('a@x.com', '2026-10-01'), [], 'a database without the journal table reads as empty, not a crash');
  eq(await queries.getDaySummaries('a@x.com'), [], 'day list on a pre-journal database is empty');
  eq(await queries.getLastActivityAt('a@x.com'), null, 'last activity on a pre-journal database is null');

  const t = store.table<Entry>('journal_entries');
  for (const e of sample) await t.insert(e);
  await t.insert(mk('x1', '2026-10-01', '2026-10-01T10:00:00.000Z', "Someone else's private note about the Bank", undefined, 'b@x.com'));

  const day1 = await queries.getEntriesForDate('a@x.com', '2026-10-01');
  eq(day1.map((e: Entry) => e.id), ['2', '1'], 'a day lists newest entry first');
  assert(!day1.some((e: Entry) => e.owner_id !== 'a@x.com'), 'a day never includes another owner\'s entries');
  eq((await queries.getDaySummaries('a@x.com')).map((d: any) => d.count), [1, 2, 1], 'summaries ignore other owners');
  const hits = await queries.searchEntries('a@x.com', 'bank');
  eq(hits.map((e: Entry) => e.id), ['3'], 'search finds only the owner\'s match, not the other owner\'s');
  eq(await queries.getLastActivityAt('a@x.com'), '2026-10-03T05:00:00.000Z', 'last activity is scoped to the owner');
  eq(await queries.getLastActivityAt('nobody@x.com'), null, 'an owner with no entries has no last activity');

  await t.update('4', { content: 'Old one, revised', updated_at: '2026-10-06T07:00:00.000Z' });
  eq(await queries.getLastActivityAt('a@x.com'), '2026-10-06T07:00:00.000Z', 'editing an old entry moves last-activity forward');
  await t.remove('4');
  eq((await queries.getDaySummaries('a@x.com')).map((d: any) => d.date), ['2026-10-03', '2026-10-01'], 'deleting the only entry removes the day');

  // --------------------------------------- in-browser reminder rules --------
  console.log('\n-- browser reminder rules');
  const P = rem.DEFAULT_PREFS;
  eq(rem.sanitizePrefs(null), P, 'sanitizePrefs(null) → defaults');
  eq(rem.sanitizePrefs('garbage'), P, 'sanitizePrefs(string) → defaults');
  eq(rem.sanitizePrefs({ enabled: 'yes', everyHours: 999, startHour: -3, endHour: 'x', skipIfRecent: 'no' }),
    { ...P, enabled: false, skipIfRecent: false }, 'sanitizePrefs rejects out-of-range/odd values field by field');
  eq(rem.sanitizePrefs({ enabled: true, everyHours: 2, startHour: 8, endHour: 20, skipIfRecent: false }),
    { enabled: true, everyHours: 2, startHour: 8, endHour: 20, skipIfRecent: false }, 'sanitizePrefs keeps valid values');
  assert(rem.sanitizePrefs({}).skipIfRecent === true, 'skipIfRecent defaults on when absent');

  const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m, 0, 0); // local time
  const win = { startHour: 9, endHour: 21 };
  assert(rem.inActiveWindow(at(9), win) && rem.inActiveWindow(at(20, 59), win), 'window includes its start hour and runs to just before the end');
  assert(!rem.inActiveWindow(at(21), win) && !rem.inActiveWindow(at(8, 59), win), 'window excludes the end hour and anything before the start');
  const night = { startHour: 20, endHour: 6 };
  assert(rem.inActiveWindow(at(23), night) && rem.inActiveWindow(at(2), night) && !rem.inActiveWindow(at(12), night), 'a window can wrap past midnight');
  assert(rem.inActiveWindow(at(3), { startHour: 7, endHour: 7 }), 'equal start/end means all day');

  const on = { ...P, enabled: true };
  const noon = at(12).getTime();
  assert(!rem.isDue(noon, noon - 1, P), 'never due while reminders are off');
  assert(!rem.isDue(noon, null, on), 'never due before a schedule exists');
  assert(!rem.isDue(noon, noon + 1, on), 'not due before its time');
  assert(rem.isDue(noon, noon, on), 'due exactly at its time (inside the window)');
  assert(!rem.isDue(at(23).getTime(), at(22).getTime(), on), 'overdue but outside the window → waits');
  assert(rem.isDue(at(9, 0).getTime(), at(22).getTime() - 86_400_000, on), '...and fires once the window reopens next morning');

  const H = 3_600_000;
  eq(rem.afterDueCheck(noon, null, on), { fire: true, nextDueAt: noon + 3 * H }, 'no history → fire, next in 3h');
  eq(rem.afterDueCheck(noon, noon - 1 * H, on), { fire: false, nextDueAt: noon - 1 * H + 3 * H }, 'wrote 1h ago → skip, push to 3h after that note');
  eq(rem.afterDueCheck(noon, noon - 3 * H, on).fire, true, 'wrote exactly 3h ago → fire (not "recent")');
  eq(rem.afterDueCheck(noon, noon - 1 * H, { ...on, skipIfRecent: false }).fire, true, 'skipIfRecent off → always fire');
  eq(rem.afterDueCheck(noon, noon - 1 * H, { ...on, everyHours: 1 }).fire, true, 'a 1h interval doesn\'t skip for a note written exactly 1h ago');
  assert(new Set([0, 1, 2, 3].map(rem.reminderBody)).size === 4, 'four distinct prompts in rotation');
  eq(rem.reminderBody(4), rem.reminderBody(0), 'prompt rotation wraps');
  assert(typeof rem.reminderBody(-1) === 'string' && rem.reminderBody(-1).length > 0, 'negative counter still yields a prompt');

  // ------------------------------------------------------ desktop helper ----
  console.log('\n-- desktop helper (scripts/journal-reminder.js)');
  const helper = createRequire(import.meta.url ?? __filename)(path.join(ROOT, 'scripts/journal-reminder.js'));

  eq(helper.parseArgs(['--every', '2', '--install', '--url=http://x.test', '--dry-run']),
    { every: '2', install: true, url: 'http://x.test', 'dry-run': true }, 'parseArgs: spaced values, =values and booleans');
  eq(helper.getConfig({}, {}), { every: 3, start: 9, end: 21, url: 'http://localhost:3000', journalUrl: 'http://localhost:3000/journal?focus=1' }, 'config defaults');
  eq(helper.getConfig({ every: '2' }, { JOURNAL_REMINDER_EVERY_HOURS: '6' }).every, 2, 'config: flag beats .env');
  eq(helper.getConfig({}, { JOURNAL_REMINDER_EVERY_HOURS: '6' }).every, 6, 'config: .env beats default');
  eq(helper.getConfig({ every: '0', start: '25', end: 'x' }, {}).every, 3, 'config: out-of-range falls back to the default (every)');
  eq([helper.getConfig({ start: '25' }, {}).start, helper.getConfig({ end: 'x' }, {}).end], [9, 21], 'config: out-of-range / junk falls back (start, end)');
  eq(helper.getConfig({}, { MERIDIAN_URL: 'https://m.example.com///' }).journalUrl, 'https://m.example.com/journal?focus=1', 'config: trailing slashes trimmed from the URL');

  // The two implementations of the active-window rule must agree for every hour.
  let parity = true;
  for (const [s, e] of [[9, 21], [20, 6], [7, 7], [0, 23], [23, 0]] as const) {
    for (let h = 0; h < 24; h++) {
      if (helper.inWindow(at(h, 30), s, e) !== rem.inActiveWindow(at(h, 30), { startHour: s, endHour: e })) { parity = false; console.error(`      mismatch window ${s}-${e} at ${h}:30`); }
    }
  }
  assert(parity, 'helper and browser agree on the active window for every hour of the day');

  const cfg = helper.getConfig({}, {});
  const nowD = at(14);
  const L = (hoursAgo: number) => nowD.getTime() - hoursAgo * H;
  eq(helper.decide({ now: nowD, cfg, lastActivity: null, force: false }).fire, true, 'helper fires in-window with no history');
  eq(helper.decide({ now: at(23), cfg, lastActivity: null, force: false }).fire, false, 'helper stays quiet outside the window');
  eq(helper.decide({ now: nowD, cfg, lastActivity: L(1), force: false }).fire, false, 'helper skips when you wrote 1h ago');
  eq(helper.decide({ now: nowD, cfg, lastActivity: L(4), force: false }).fire, true, 'helper fires when your last note is older than the interval');
  eq(helper.decide({ now: at(23), cfg, lastActivity: L(1), force: true }).fire, true, '--test/--force overrides window and recency');

  const dbFile = path.join(tmp, 'helper-db.json');
  fs.writeFileSync(dbFile, JSON.stringify({ journal_entries: [
    { created_at: '2026-10-01T05:00:00.000Z', updated_at: '2026-10-01T05:00:00.000Z' },
    { created_at: '2026-10-02T05:00:00.000Z', updated_at: '2026-10-04T05:00:00.000Z' },
  ] }));
  eq(helper.lastActivityFromLocalDb({}, dbFile), Date.parse('2026-10-04T05:00:00.000Z'), 'helper reads the newest create/update from the local DB');
  eq(helper.lastActivityFromLocalDb({ DATA_PROVIDER: 'supabase' }, dbFile), null, 'helper does not read the local file under Supabase');
  fs.writeFileSync(dbFile, '{ half-written');
  eq(helper.lastActivityFromLocalDb({}, dbFile), null, 'helper treats a corrupt/mid-write DB as "unknown", not a crash');
  eq(helper.lastActivityFromLocalDb({}, path.join(tmp, 'nope.json')), null, 'helper treats a missing DB as "unknown"');
  fs.writeFileSync(dbFile, JSON.stringify({ clients: [] }));
  eq(helper.lastActivityFromLocalDb({}, dbFile), null, 'helper handles a DB with no journal table');

  // Generators. Nasty characters must not break the toast XML.
  const toast: string = helper.buildToastScript({ title: 'A & B <x> "q" \'s\'', body: 'it\'s <b>', url: 'http://localhost:3000/journal?focus=1&x=1', iconPath: 'C:\\app\\public\\icons\\icon-192.png' });
  assert(!/<x>|<b>/.test(toast), 'toast: angle brackets in text are escaped');
  assert(toast.includes('A &amp; B &lt;x&gt; &quot;q&quot; &apos;s&apos;'), 'toast: &, <, >, quotes escaped in the title');
  assert(toast.includes('launch="http://localhost:3000/journal?focus=1&amp;x=1"'), 'toast: the click URL is XML-escaped');
  assert(toast.includes('src="file:///C:/app/public/icons/icon-192.png"'), 'toast: Windows icon path becomes a file:/// URI');
  assert(/\r\n'@$/m.test(toast) && toast.includes("@'\r\n<toast"), 'toast: here-string opens and closes on its own lines');
  assert((toast.match(/<text>/g) || []).length === 2 && toast.includes("CreateToastNotifier('{1AC14E77-"), 'toast: two text lines, notifier created');

  const vbs: string = helper.buildVbs('C:\\Program Files\\nodejs\\node.exe', 'C:\\proj\\scripts\\journal-reminder.js', ['--every', '3']);
  // As a VBScript string literal this line evaluates to:
  //   "C:\Program Files\nodejs\node.exe" "C:\proj\scripts\journal-reminder.js" --every 3
  assert(vbs.split('\r\n').includes('sh.Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\proj\\scripts\\journal-reminder.js"" --every 3", 0, False'),
    'vbs: paths with spaces are quoted, and quotes are doubled for VBScript');
  assert(vbs.includes(', 0, False'), 'vbs: runs hidden (window style 0) and without waiting');

  const task: string = helper.buildTaskScript("C:\\Users\\O'Neil\\Meridian\\j.vbs", 3);
  assert(task.includes("O''Neil"), 'task: single quotes in paths are doubled for PowerShell');
  assert(task.includes('-AllowStartIfOnBatteries') && task.includes('-DontStopIfGoingOnBatteries') && task.includes('-StartWhenAvailable'),
    'task: runs on battery and catches up after sleep (the schtasks.exe defaults would silently never run on a laptop)');
  assert(task.includes('New-TimeSpan -Hours 3'), 'task: repeats at the requested interval');

  const plist: string = helper.buildPlist('/usr/local/bin/node', '/p/a&b/script.js', ['--every', '4'], 4);
  assert(plist.includes('<integer>14400</integer>') && plist.includes('/p/a&amp;b/script.js'), 'plist: interval in seconds, paths XML-escaped');

  const cron: string = helper.buildCronLine('/usr/bin/node', '/p/s.js', ['--every', '3'], 3, 1000);
  assert(cron.startsWith('0 */3 * * * DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus ') && cron.endsWith('# meridian-journal-reminder'), 'cron: schedule, D-Bus env and marker');
  assert(helper.buildCronLine('/n', '/s.js', [], 1, 1000).startsWith('0 * * * * '), 'cron: hourly uses *');
  assert(helper.buildCronLine('/n', '/p/100%/s.js', [], 3, 1000).includes('100\\%'), 'cron: % is escaped (cron treats it as a newline)');
  eq(helper.scheduledArgs({ every: 3, start: 9, end: 21, url: 'http://u' }, {}), ['--every', '3'], 'scheduled args: only --every is baked in by default');
  eq(helper.scheduledArgs({ every: 2, start: 8, end: 21, url: 'http://u' }, { start: '8', url: 'http://u' }), ['--every', '2', '--start', '8', '--url', 'http://u'], 'scheduled args: explicit flags are baked in too');

  console.log(failures === 0 ? '\nAll journal checks passed.' : `\n${failures} check(s) FAILED.`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => { process.chdir(ROOT); fs.rmSync(tmp, { recursive: true, force: true }); });
