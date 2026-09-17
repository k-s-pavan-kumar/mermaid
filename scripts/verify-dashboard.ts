/**
 * Verifies the two pieces of new logic that are easy to get quietly wrong:
 *
 *  1. the half-hour timebox model, including that rows written under the old
 *     whole-hour model still land in exactly the same place; and
 *  2. the Dashboard's day-spend arithmetic — in particular that a focus
 *     session and the timebox block it came from are not counted twice, and
 *     that every day still sums to 24 hours.
 *
 * Run with:  npx tsx scripts/verify-dashboard.ts
 */
import { writeDb, readDb, type LocalDB } from '../src/lib/data/local-store';
import {
  startMinutes, durationMinutes, slotToHourMinute, clampDuration,
  normaliseMinute, fmtClock, fmtDuration, fmtRange,
} from '../src/features/today/time';
import {
  getDaySpend, revenueIn, fiscalYearOf, fiscalMonths, monthEndOf, weekStartOf,
  daysBetween, MINUTES_PER_DAY, UNTRACKED_KEY, MEETINGS_KEY, UNASSIGNED_KEY,
} from '../src/features/dashboard/queries';
import type { Task, FocusSession } from '../src/features/today/types';
import type { Invoice } from '../src/features/billing/types';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
  );
}

async function main() {
  const OWNER = 'verify@meridian.test';
  const DAY = '2026-05-11'; // a Monday

  // ---------------------------------------------------------------------------
  console.log('\n1. Half-hour time model');
  // ---------------------------------------------------------------------------

  const legacy = {
    scheduled_hour: 9, scheduled_minute: undefined, duration_hours: 2, duration_minutes: undefined,
  };
  eq(startMinutes(legacy as Task), 9 * 60, 'a pre-existing whole-hour row still starts at 9:00');
  eq(durationMinutes(legacy as Task), 120, 'a pre-existing 2h row is still 120 minutes');

  const half = { scheduled_hour: 9, scheduled_minute: 30, duration_hours: 1, duration_minutes: 90 };
  eq(startMinutes(half as Task), 9 * 60 + 30, 'a :30 row starts half an hour later');
  eq(durationMinutes(half as Task), 90, 'duration_minutes wins over duration_hours');
  eq(fmtRange(half as Task), '9:30 AM – 11 AM', 'range reads correctly across the hour boundary');

  // nulls, which is what the columns actually hold for old rows
  const nulled = { scheduled_hour: 14, scheduled_minute: null, duration_hours: 1, duration_minutes: null };
  eq(startMinutes(nulled as Task), 14 * 60, 'null minute is treated as :00');
  eq(durationMinutes(nulled as Task), 60, 'null duration_minutes falls back to duration_hours');

  eq(normaliseMinute(0), 0, 'minute 0 normalises to 0');
  eq(normaliseMinute(30), 30, 'minute 30 normalises to 30');
  eq(normaliseMinute(29), 30, 'a stray 29 snaps to 30');
  eq(normaliseMinute(14), 0, 'a stray 14 snaps to 0');
  eq(normaliseMinute(null), 0, 'a null minute snaps to 0');

  eq(clampDuration(10), 30, 'a sub-30-minute resize clamps up to the 30-minute floor');
  eq(clampDuration(44), 30, '44 minutes snaps down to the nearest half hour');
  eq(clampDuration(45), 60, 'an exact 45-minute tie rounds up, not down');
  eq(clampDuration(46), 60, '46 minutes snaps up to the nearest half hour');
  eq(clampDuration(9999), 480, 'an 8-hour ceiling still applies');

  eq(slotToHourMinute(0), { hour: 0, minute: 0 }, 'slot 0 is midnight');
  eq(slotToHourMinute(19), { hour: 9, minute: 30 }, 'slot 19 is 9:30am');
  eq(slotToHourMinute(47), { hour: 23, minute: 30 }, 'slot 47 is the last half hour of the day');
  eq(slotToHourMinute(99), { hour: 23, minute: 30 }, 'an out-of-range slot clamps to the end of the day');

  eq(fmtClock(0), '12 AM', 'midnight formats as 12 AM');
  eq(fmtClock(12 * 60), '12 PM', 'noon formats as 12 PM');
  eq(fmtClock(13 * 60 + 30), '1:30 PM', 'half hours show their minutes');
  eq(fmtDuration(30), '30m', '30 minutes reads as 30m');
  eq(fmtDuration(90), '1h 30m', '90 minutes reads as 1h 30m');
  eq(fmtDuration(120), '2h', 'a round 2 hours drops the minutes');

  // ---------------------------------------------------------------------------
  console.log('\n2. Day-spend: no double counting, always 24h');
  // ---------------------------------------------------------------------------

  function task(over: Partial<Task>): Task {
    return {
      id: `t_${Math.random().toString(36).slice(2, 8)}`,
      owner_id: OWNER, project_id: null, title: 'x',
      dump_date: DAY, scheduled_date: DAY, scheduled_hour: 9, scheduled_minute: 0,
      duration_hours: 1, duration_minutes: 60, done: false,
      created_at: `${DAY}T00:00:00.000Z`, ...over,
    };
  }
  function session(over: Partial<FocusSession>): FocusSession {
    return {
      id: `f_${Math.random().toString(36).slice(2, 8)}`,
      owner_id: OWNER, task_id: null, project_id: null, date: DAY,
      started_at: `${DAY}T09:00:00.000Z`, minutes: 60, completed_minutes: 60, note: null, ...over,
    };
  }

  const base: LocalDB = {
    clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
    bounty_submissions: [], project_metrics: [], milestones: [], notes: [],
    tasks: [], integrations: [], alert_states: [], meetings: [], settings: [],
    focus_sessions: [],
  };

  // A 2h block on project A, and a 1h focus session against the same project:
  // the plan and the timer describe the SAME stretch of time, so the day should
  // show 2h for that project, not 3h.
  writeDb({
    ...base,
    projects: [{
      id: 'p_a', owner_id: OWNER, name: 'Alpha', type: 'client', types: ['client'],
      client_id: null, status: 'ontrack', description: null, created_at: `${DAY}T00:00:00.000Z`,
    }],
    tasks: [
      task({ project_id: 'p_a', scheduled_hour: 9, duration_minutes: 120, duration_hours: 2, done: true }),
      // a half-hour block, which the old model could not express at all
      task({ project_id: 'p_a', scheduled_hour: 14, scheduled_minute: 30, duration_minutes: 30, duration_hours: 1 }),
    ],
    focus_sessions: [session({ project_id: 'p_a', completed_minutes: 60 })],
    meetings: [{
      id: 'm1', owner_id: OWNER, client_id: null, project_id: null, title: 'Call',
      starts_at: `${DAY}T16:00:00.000Z`, duration_mins: 45, location: null,
      attendees: null, notes: null, follow_up: null, created_at: `${DAY}T00:00:00.000Z`,
    }],
  });

  const [day] = await getDaySpend(OWNER, DAY, DAY);
  if (!day) throw new Error('getDaySpend returned nothing');

  eq(day.buckets['client'], 150, 'planned 2h + 0.5h and a 1h timer inside it counts as 150m, not 210m');
  eq(day.buckets[MEETINGS_KEY], 45, 'a 45-minute meeting is counted separately');
  eq(day.focusMinutes, 60, 'focus minutes are still reported in full');
  eq(day.trackedMinutes, 195, 'tracked time is the sum of the real buckets');
  eq(day.buckets[UNTRACKED_KEY], MINUTES_PER_DAY - 195, 'the remainder of the day is unaccounted, not dropped');
  eq(
    Object.values(day.buckets).reduce((a, b) => a + b, 0),
    MINUTES_PER_DAY,
    'every bucket together sums to exactly 24 hours'
  );
  eq(day.tasksDone, 1, 'completed tasks are counted');
  eq(day.tasksPlanned, 2, 'planned tasks are counted');
  assert(day.moved === true, 'a day with work in it counts as moved');

  // A task still in the brain dump has no hour and must claim no time.
  writeDb({
    ...base,
    tasks: [task({ scheduled_date: null, scheduled_hour: null, scheduled_minute: null })],
  });
  const [empty] = await getDaySpend(OWNER, DAY, DAY);
  eq(empty?.trackedMinutes, 0, 'an unscheduled brain-dump task claims no time');
  eq(empty?.buckets[UNTRACKED_KEY], MINUTES_PER_DAY, 'a day with nothing scheduled is 24h unaccounted');
  assert(empty?.moved === false, 'a day with nothing done does not count as moved');

  // Overlapping records that together claim more than 24h must be scaled, not
  // allowed to produce a pie summing to more than a day.
  writeDb({
    ...base,
    tasks: [
      task({ scheduled_hour: 0, duration_minutes: 480, duration_hours: 8 }),
      task({ scheduled_hour: 8, duration_minutes: 480, duration_hours: 8 }),
      task({ scheduled_hour: 16, duration_minutes: 480, duration_hours: 8 }),
    ],
    meetings: [{
      id: 'm2', owner_id: OWNER, client_id: null, project_id: null, title: 'Overlap',
      starts_at: `${DAY}T10:00:00.000Z`, duration_mins: 600, location: null,
      attendees: null, notes: null, follow_up: null, created_at: `${DAY}T00:00:00.000Z`,
    }],
  });
  const [over] = await getDaySpend(OWNER, DAY, DAY);
  eq(
    Object.values(over?.buckets ?? {}).reduce((a, b) => a + b, 0),
    MINUTES_PER_DAY,
    'over-claimed days are scaled back to 24 hours rather than overflowing'
  );
  eq(over?.buckets[UNTRACKED_KEY], 0, 'a fully claimed day leaves nothing unaccounted');

  // Focus work with no project lands in its own bucket rather than vanishing.
  writeDb({ ...base, focus_sessions: [session({ project_id: null, completed_minutes: 90 })] });
  const [unassigned] = await getDaySpend(OWNER, DAY, DAY);
  eq(unassigned?.buckets[UNASSIGNED_KEY], 90, 'focus time with no project is kept, under its own bucket');

  // ---------------------------------------------------------------------------
  console.log('\n3. Financial year and revenue');
  // ---------------------------------------------------------------------------

  const fyApril = fiscalYearOf('2026-02-11', 4);
  eq(fyApril.start, '2025-04-01', 'February 2026 belongs to the FY starting April 2025');
  eq(fyApril.end, '2026-03-31', '...and ending March 2026');
  eq(fyApril.label, '2025–26', '...labelled as a straddling year');

  const fyAprilLate = fiscalYearOf('2026-09-17', 4);
  eq(fyAprilLate.start, '2025-04-01'.replace('2025', '2026'), 'September 2026 belongs to the FY starting April 2026');
  eq(fyAprilLate.end, '2027-03-31', '...and ending March 2027');

  const fyJan = fiscalYearOf('2026-09-17', 1);
  eq(fyJan.start, '2026-01-01', 'a January financial year starts on 1 Jan');
  eq(fyJan.end, '2026-12-31', '...and ends on 31 Dec');
  eq(fyJan.label, '2026', '...and is labelled with the single year');

  const months = fiscalMonths('2026-04-01');
  eq(months.length, 12, 'a financial year has twelve months');
  eq(months[0], '2026-04-01', 'the first month is the start month');
  eq(months[9], '2027-01-01', 'the tenth month rolls over into the next calendar year');
  eq(months[11], '2027-03-01', 'the last month is the month before the start month');

  eq(monthEndOf('2026-02-10'), '2026-02-28', 'February 2026 ends on the 28th');
  eq(monthEndOf('2028-02-10'), '2028-02-29', 'a leap February ends on the 29th');
  eq(weekStartOf('2026-05-14'), '2026-05-11', 'weeks start on Monday');
  eq(weekStartOf('2026-05-11'), '2026-05-11', 'a Monday is its own week start');
  eq(weekStartOf('2026-05-17'), '2026-05-11', 'Sunday belongs to the week that began on Monday');
  eq(daysBetween('2026-05-01', '2026-05-31'), 31, 'day counts are inclusive of both ends');

  function inv(over: Partial<Invoice>): Invoice {
    return {
      id: `i_${Math.random().toString(36).slice(2, 8)}`, owner_id: OWNER,
      project_id: null, client_id: 'c1', quote_id: null, stream: 'freelance',
      number: 'INV-1', description: null, items: [], amount: 1000, tax_pct: 0,
      currency: 'INR', notes: null, status: 'paid',
      issued_at: '2026-05-01', due_at: null, paid_at: '2026-05-20', ...over,
    };
  }

  const rev = revenueIn(
    [
      inv({ amount: 1000, status: 'paid', paid_at: '2026-05-20' }),
      // paid, but the money landed outside the window — must not count
      inv({ amount: 9999, status: 'paid', issued_at: '2026-05-02', paid_at: '2026-07-01' }),
      inv({ amount: 500, status: 'pending', issued_at: '2026-05-10' }),
      // a draft is an intention, not income
      inv({ amount: 7777, status: 'draft', issued_at: '2026-05-10' }),
      inv({ amount: 200, status: 'paid', tax_pct: 10, paid_at: '2026-05-21' }),
    ],
    '2026-05-01',
    '2026-05-31'
  );
  eq(rev.paid, 1220, 'paid revenue uses paid_at and includes tax');
  eq(rev.outstanding, 500, 'issued-but-unpaid is tracked separately');
  eq(rev.invoiced, 1720, 'invoiced is paid plus outstanding');

  // restore whatever was there before
  writeDb(base);
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
}

main().then(() => {
  if (failures > 0) process.exit(1);
});
