/**
 * Income streams: the target/pace maths (pure) and the store functions that
 * keep a category in exactly one stream (run against a throw-away local DB).
 * Run:  npm run verify:streams
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let failed = 0;
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
  if (!ok) failed++;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-streams-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'db.local.json'), JSON.stringify({ finance_entries: [], income_streams: [] }));
  process.chdir(tmp);
  process.env.DATA_PROVIDER = 'local';

  const S = await import('../src/features/daily-finance/streams');
  const Q = await import('../src/features/daily-finance/queries');
  type E = import('../src/features/daily-finance/types').FinanceEntry;

  const inc = (date: string, category: string, amount: number): E => ({ id: `${date}-${category}`, owner_id: 'me', date, type: 'income', category, amount, note: null, source: 'invoice_payment', created_at: '' });
  const exp = (date: string, amount: number): E => ({ id: `x${date}`, owner_id: 'me', date, type: 'expense', category: 'Food', amount, note: null, source: 'manual', created_at: '' });
  const mk = (id: string, name: string, categories: string[], target: number | null, order = 0): import('../src/features/daily-finance/streams').IncomeStream =>
    ({ id, owner_id: 'me', name, color: '#000', categories, targets: target ? { '2026': target } : {}, sort_order: order, created_at: '' });

  // The ledger from the user's Year view: Jun 19,800 · Jul 25,000 · Aug 29,800 · Sept 1,21,800 (= 1,96,400).
  const entries = [
    inc('2026-06-10', 'Salary', 19_800), inc('2026-07-10', 'Salary', 25_000), inc('2026-08-10', 'Salary', 29_800),
    inc('2026-09-05', 'Bug bounty', 80_000), inc('2026-09-20', 'Client payment', 41_800),
    inc('2025-12-30', 'Salary', 99_999),              // other year → ignored
    exp('2026-09-15', 123_171),                       // expenses never count
  ];
  const streams = [mk('a', 'Job', ['Salary'], 300_000, 0), mk('b', 'Bounties', ['bug bounty'], 200_000, 1)]; // case-insensitive match
  const today = '2026-10-03';
  const o = S.buildStreamsOverview(entries, streams, 2026, today);

  eq(o.streams.map((s) => s.earned), [74_600, 80_000], 'income lands in its stream by category (case-insensitive)');
  eq(o.unassigned?.earned, 41_800, 'unowned category → Unassigned, so nothing is hidden');
  eq(o.unassigned?.categories, ['Client payment'], 'Unassigned lists which categories to assign');
  eq(o.totalEarned, 196_400, 'streams + unassigned = Income YTD (1,96,400)');
  eq(o.streams[0]!.monthly.slice(5, 9), [19_800, 25_000, 29_800, 0], 'monthly breakdown per stream');
  eq(o.streams[0]!.pct, 25, 'pct = earned ÷ target (74,600 / 3,00,000 → 25%)');
  eq(o.streams[0]!.remaining, 225_400, 'remaining to target');
  eq(o.totalTarget, 500_000, 'combined target');
  eq(o.totalPct, 31, 'overall % counts only targeted streams (1,54,600 / 5,00,000)');
  eq(Math.round(o.elapsed * 1000), 756, 'year elapsed on 3 Oct ≈ 75.6%');
  eq(o.streams[0]!.status, 'behind', '25% earned at 75.6% of the year → behind pace');
  eq(o.streams[0]!.perMonthNeeded, Math.ceil(225_400 / 3), 'per-month needed spreads over Oct–Dec (current month included)');

  const beat = S.buildStreamsOverview(entries, [mk('a', 'Job', ['Salary'], 60_000)], 2026, today);
  eq([beat.streams[0]!.status, beat.streams[0]!.pct, beat.streams[0]!.perMonthNeeded], ['achieved', 124, null], 'beating a target → achieved, uncapped %, nothing more needed');
  eq(S.buildStreamsOverview(entries, [mk('a', 'Job', ['Salary'], null)], 2026, today).streams[0]!.status, 'no_target', 'no target set → no_target');
  eq(S.buildStreamsOverview(entries, [mk('a', 'Job', ['Salary'], 500_000)], 2026, '2027-01-02').streams[0]!.status, 'missed', 'year over and short → missed');
  eq(S.buildStreamsOverview([], [mk('a', 'Job', ['Salary'], 100)], 2026, today).streams[0]!.earned, 0, 'empty ledger → zeros, no crash');
  // 10,000 of 1,00,000 on 1 Feb: 32 of 365 days gone → expected ≈ 8,767 → ahead.
  eq(S.buildStreamsOverview([inc('2026-01-05', 'Salary', 10_000)], [mk('a', 'Job', ['Salary'], 100_000)], 2026, '2026-02-01').streams[0]!.status, 'ahead', 'earned ≥ pro-rata expectation → ahead');
  // 8,000 on the same day is 91% of expected → slightly behind; 2,000 is 23% → behind.
  eq(S.buildStreamsOverview([inc('2026-01-05', 'Salary', 8_000)], [mk('a', 'Job', ['Salary'], 100_000)], 2026, '2026-02-01').streams[0]!.status, 'slightly_behind', '70–100% of expected → slightly behind');
  eq(S.buildStreamsOverview([], [{ ...mk('a', 'Job', ['Salary'], null), targets: { '2027': 100 } }], 2027, '2026-10-03').streams[0]!.status, 'upcoming', 'future year with a target → upcoming');
  eq(S.buildStreamsOverview([], [mk('a', 'Job', ['Salary'], 100)], 2027, '2026-10-03').streams[0]!.status, 'no_target', 'a 2026 target does not leak into 2027');

  // ── a category lives in one stream only ──
  const moved = S.assignCategories([mk('a', 'Job', ['Salary', 'Bug bounty'], null), mk('b', 'Other', ['Client payment'], null)], 'b', ['bug bounty', 'Client payment']);
  eq([moved[0]!.categories, moved[1]!.categories], [['Salary'], ['bug bounty', 'Client payment']], 'assigning a category takes it out of the other stream');
  eq(S.knownIncomeCategories([inc('2026-01-01', 'salary', 1), inc('2026-01-01', 'Consulting', 1), exp('2026-01-01', 1)], ['Salary', 'Bug bounty']), ['Bug bounty', 'Consulting', 'Salary'], 'category list: fixed + seen, case-insensitive de-dupe, expenses excluded');

  // ── store: save / move / validate / delete / seed ──
  const w = JSON.parse(fs.readFileSync('data/db.local.json', 'utf8'));
  w.finance_entries = entries.map((e) => ({ ...e, owner_id: 'me' }));
  fs.writeFileSync('data/db.local.json', JSON.stringify(w));

  const a = await Q.saveIncomeStream({ ownerId: 'me', name: 'Job', categories: ['Salary'], year: 2026, target: 300_000 });
  const b = await Q.saveIncomeStream({ ownerId: 'me', name: 'Bounties', categories: ['Bug bounty'], year: 2026, target: null });
  eq([a.ok, b.ok], [true, true], 'two streams created');
  const dup = await Q.saveIncomeStream({ ownerId: 'me', name: ' job ', categories: [], year: 2026, target: null });
  eq(dup.ok, false, 'duplicate name (case/space-insensitive) rejected');
  eq((await Q.saveIncomeStream({ ownerId: 'me', name: '', categories: [], year: 2026, target: null })).ok, false, 'empty name rejected');
  eq((await Q.saveIncomeStream({ ownerId: 'me', name: 'X', categories: [], year: 2026, target: -5 })).ok, false, 'negative target rejected');

  if (b.ok) await Q.saveIncomeStream({ ownerId: 'me', id: b.id, name: 'Bounties', categories: ['Bug bounty', 'Salary'], year: 2026, target: 150_000 });
  const after = await Q.getIncomeStreams('me');
  eq(after.map((s) => [s.name, s.categories]), [['Job', []], ['Bounties', ['Bug bounty', 'Salary']]], 'claiming “Salary” released it from Job');
  eq(after[1]!.targets, { '2026': 150_000 }, 'target stored per year');

  if (b.ok) await Q.saveIncomeStream({ ownerId: 'me', id: b.id, name: 'Bounties', categories: ['Bug bounty', 'Salary'], year: 2027, target: 90_000 });
  eq((await Q.getIncomeStreams('me'))[1]!.targets, { '2026': 150_000, '2027': 90_000 }, 'a new year adds its own target, keeps the old one');
  if (b.ok) await Q.saveIncomeStream({ ownerId: 'me', id: b.id, name: 'Bounties', categories: ['Bug bounty', 'Salary'], year: 2027, target: null });
  eq((await Q.getIncomeStreams('me'))[1]!.targets, { '2026': 150_000 }, 'clearing the target removes only that year');

  eq(await Q.removeIncomeStream('someone-else', a.ok ? a.id : ''), false, "can't delete another owner's stream");
  eq(await Q.removeIncomeStream('me', a.ok ? a.id : ''), true, 'owner can delete');
  eq((await Q.getIncomeStreams('me')).length, 1, 'one stream left');
  eq(JSON.parse(fs.readFileSync('data/db.local.json', 'utf8')).finance_entries.length, entries.length, 'deleting a stream never touches income entries');

  const seeded = await Q.seedStreamsFromCategories('me', 2026);
  eq(seeded, 1, 'seeding skips categories already owned (only “Client payment” is new)');
  eq(await Q.seedStreamsFromCategories('me', 2026), 0, 'seeding twice creates nothing');

  const live = await Q.getStreamsOverview('me', 2026, today);
  eq(live.overview.totalEarned, 196_400, 'end to end: streams add up to Income YTD');
  eq(live.overview.unassigned, null, 'after seeding, nothing is unassigned');
  eq(live.incomeCategories.includes('Teaching payment') && live.incomeCategories.includes('Salary'), true, 'picker offers fixed labels even before any payment');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall income-stream checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
