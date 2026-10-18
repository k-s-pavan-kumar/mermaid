/**
 * Three recent changes, against a throw-away local DB:
 *   1. deleting one / the rest / all of a Repeat series
 *   2. yearly goals planned month by month
 *   3. investment categories with a cumulative total per category
 * Run:  npm run verify:goals-categories
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-goals-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'db.local.json'), JSON.stringify({ finance_investment_log: [] }));
  process.chdir(tmp);
  process.env.DATA_PROVIDER = 'local';

  // ---- 1. series deletion ------------------------------------------------
  const { pickSeriesToDelete } = await import('../src/features/today/series');
  type T = import('../src/features/today/types').Task;
  const mk = (id: string, date: string, over: Partial<T> = {}): T => ({
    id, owner_id: 'me', project_id: 'p', title: 'DM work', dump_date: date, scheduled_date: date, scheduled_hour: 15,
    duration_hours: 1, done: false, created_at: '', series_id: 's1', ...over,
  });
  const days = [mk('a', '2026-10-14', { done: true }), mk('b', '2026-10-16'), mk('c', '2026-10-19'), mk('d', '2026-10-20'),
    mk('x', '2026-10-19', { series_id: 's2' }), mk('o', '2026-10-19', { series_id: null })];
  const ids = (l: T[]) => l.map((t) => t.id).sort();
  eq(ids(pickSeriesToDelete(days, days[2]!, 'this')), ['c'], "'this' removes only the clicked day");
  eq(ids(pickSeriesToDelete(days, days[2]!, 'later')), ['c', 'd'], "'later' removes that day and after, not earlier days");
  eq(ids(pickSeriesToDelete(days, days[1]!, 'later')), ['b', 'c', 'd'], "'later' from the first open day keeps the done day");
  eq(ids(pickSeriesToDelete(days, days[0]!, 'later')), ['a', 'b', 'c', 'd'], "'later' on a done day still removes the one clicked");
  eq(ids(pickSeriesToDelete(days, days[1]!, 'all')), ['a', 'b', 'c', 'd'], "'all' removes the whole series incl. done days, never another series");
  eq(ids(pickSeriesToDelete(days, days[5]!, 'all')), ['o'], 'a one-off task only ever deletes itself');

  // ---- 2. goals ----------------------------------------------------------
  const G = await import('../src/features/goals/types');
  eq(G.monthKey(2026, '03'), '2026-03', 'month key builds YYYY-MM');
  eq(G.monthKey(2026, '13'), null, 'month 13 rejected');
  eq(G.monthKey(2026, ''), null, 'blank month = not placed yet');
  eq(G.monthLabel('2026-03'), 'March 2026', 'month label');
  eq(G.monthLabel(null), 'No month yet', 'null month label');

  const { table } = await import('../src/lib/data');
  const Q = await import('../src/features/goals/queries');
  await table<import('../src/features/goals/types').Goal>('goals').insert({ id: 'g1', owner_id: 'me', year: 2026, title: 'Ship plugins', description: null, status: 'active', created_at: '2026-01-01' });
  await table<import('../src/features/goals/types').Goal>('goals').insert({ id: 'g2', owner_id: 'me', year: 2027, title: 'Next year', description: null, status: 'active', created_at: '2026-01-02' });
  await table<import('../src/features/goals/types').Goal>('goals').insert({ id: 'g3', owner_id: 'other', year: 2026, title: "Someone else's", description: null, status: 'active', created_at: '2026-01-03' });
  const link = (id: string, goal: string, proj: string, month: string | null) =>
    table<import('../src/features/goals/types').GoalProject>('goal_projects').insert({ id, owner_id: 'me', goal_id: goal, project_id: proj, month, created_at: id });
  await link('l1', 'g1', 'pA', '2026-05'); await link('l2', 'g1', 'pB', '2026-02'); await link('l3', 'g1', 'pC', null);
  eq((await Q.getGoals('me', 2026)).map((g) => g.id), ['g1'], 'goals are per year and per owner');
  eq(await Q.getGoalYears('me'), [2026, 2027], 'year switcher lists years that have goals');
  eq((await Q.getGoalLinks('me', ['g1'])).map((l) => l.id), ['l2', 'l1', 'l3'], 'links come back in month order, unplaced last');
  eq((await Q.getLinksForProject('me', 'pA')).map((l) => l.goal_id), ['g1'], 'a project can list the goals it serves');

  // ---- 3. investment categories -----------------------------------------
  const C = await import('../src/features/daily-finance/investment-categories');
  const S = await import('../src/features/daily-finance/set-aside');
  eq(C.normaliseCategory('Gold'), 'gold', 'preset by label');
  eq(C.normaliseCategory('Mutual funds / ETFs'), 'mutual_funds', 'preset by full label');
  eq(C.normaliseCategory('FD / Bonds'), 'fd_bonds', 'FD / Bonds label');
  eq(C.normaliseCategory('  Art  '), 'art', 'custom category is trimmed + lower-cased');
  eq(C.normaliseCategory(''), 'other', 'blank = other');
  eq(C.categoryLabel('art'), 'Art', 'custom label is capitalised');
  eq(C.inferCategory('Sovereign Gold Bond'), 'gold', 'guess gold from old text');
  eq(C.inferCategory('Silver coin'), 'silver', 'guess silver');
  eq(C.inferCategory('FD – SBI'), 'fd_bonds', 'guess FD');
  eq(C.inferCategory('Nifty 50 index fund'), 'mutual_funds', 'guess fund');
  eq(C.inferCategory('Something odd'), 'other', 'no guess -> other, not stocks');

  const me = 'me';
  const add = (amount: number, investedIn: string, date: string, category?: string) =>
    S.addInvestmentLogEntry({ ownerId: me, amount, investedIn, date, category });
  eq((await add(5000, '', '2026-10-01', 'gold')).ok, true, 'category alone is enough (no description)');
  eq((await add(1000, '', '2026-10-02')).ok, false, 'no category and no description is still rejected');
  await add(3000, 'Reliance', '2026-10-03', 'stocks');
  await add(2000, '', '2026-10-05', 'gold');
  await add(1500, 'Silver coin', '2026-10-06', 'silver');
  await add(700, 'Painting', '2026-10-07', 'Art');
  // A row saved before categories existed (no category field at all):
  await table<import('../src/features/daily-finance/types').InvestmentLogEntry>('finance_investment_log').insert({
    id: 'old', owner_id: me, amount: 4000, invested_in: 'Gold ETF', date: '2026-09-01', created_at: '2026-09-01',
  });
  const log = await S.getInvestmentLog(me);
  eq(log.find((e) => e.id === 'old')?.category, 'gold', 'old row without a category is guessed from its text');
  eq(log.find((e) => e.invested_in === 'Gold')?.category, 'gold', 'blank description defaults to the category name');

  const totals = C.totalsByCategory(log);
  eq(totals.map((t) => [t.key, t.total, t.count]), [['gold', 11000, 3], ['stocks', 3000, 1], ['silver', 1500, 1], ['art', 700, 1]], 'cumulative total per category, biggest first');
  eq(totals.reduce((n, t) => n + t.share, 0) > 99.8, true, 'shares add up to ~100%');
  const run = C.runningByCategory(log);
  const goldRows = log.filter((e) => C.entryCategory(e) === 'gold').map((e) => run.get(e.id));
  eq(goldRows, [4000, 9000, 11000], 'running gold total grows row by row, oldest first');
  eq(C.cumulativeSeries(log)[0]?.points.map((p) => p.value), [4000, 9000, 11000], 'chart series for the biggest category');

  eq(await S.setInvestmentCategory('someone-else', 'old', 'stocks'), false, "can't recategorise another owner's entry");
  eq(await S.setInvestmentCategory(me, 'old', 'Mutual funds / ETFs'), true, 'recategorise an entry');
  eq((await S.getInvestmentLog(me)).find((e) => e.id === 'old')?.category, 'mutual_funds', 'new category sticks');
  eq(C.totalsByCategory(await S.getInvestmentLog(me)).find((t) => t.key === 'gold')?.total, 7000, 'gold total drops after the move');

  // ---- 4. custom client work-type tags ----------------------------------
  const W = await import('../src/features/clients/types');
  eq(W.normaliseWorkTag('  Photography  '), 'Photography', 'custom tag is trimmed, case kept');
  eq(W.normaliseWorkTag('web development'), 'web', 'typing a built-in label maps to the built-in');
  eq(W.normaliseWorkTag('MOBILE'), 'mobile', 'typing a built-in key maps to the built-in');
  eq(W.normaliseWorkTag('   '), '', 'blank tag dropped');
  eq(W.normaliseWorkTags(['Photography', 'photography', 'web', 'Web development', '']), ['Photography', 'web'], 'duplicates collapse case-insensitively');
  eq(W.normaliseWorkTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 12, 'capped at 12 tags');
  eq(W.workTypeLabel('web'), 'Web development', 'built-in label');
  eq(W.workTypeLabel('Photography'), 'Photography', 'custom label is itself');
  eq(W.workTypeColor('Photography') === W.workTypeColor('photography'), true, 'custom colour is stable per name');
  eq(W.customWorkTags([{ work_types: ['web', 'Photography'] }, { work_types: ['photography', 'Legal'] }]), ['Legal', 'Photography'], 'tag library = customs across clients, A-Z, no built-ins');
  eq(W.clientWorkTypes({ work_types: ['web', 'Legal'] }), ['web', 'Legal'], 'custom tags are kept on a client (not filtered out)');

  // ---- 5. TPN audit tracker ---------------------------------------------
  const A = await import('../src/features/audits/types');
  const au = (over: Partial<import('../src/features/audits/types').Audit>) => ({
    id: 'x', owner_id: 'me', client_name: 'C', company: null, email: null, phone: null, scope: null, stage: 'lead',
    quote_amount: null, quote_sent_on: null, quote_ref: null, invoice_amount: null, invoice_ref: null, invoice_sent_on: null,
    paid_amount: 0, paid_on: null, audit_date: null, goal_id: null, goal_month: null, notes: null, created_at: '', ...over,
  }) as import('../src/features/audits/types').Audit;
  const t = A.auditTotals([
    au({ stage: 'quoted', quote_amount: 50000 }),
    au({ stage: 'invoiced', quote_amount: 80000, invoice_amount: 80000, paid_amount: 30000 }),
    au({ stage: 'paid', quote_amount: 60000, invoice_amount: 60000, paid_amount: 60000 }),
    au({ stage: 'lost', quote_amount: 99999 }),
  ]);
  eq(t, { active: 2, quoted: 190000, invoiced: 140000, received: 90000, outstanding: 50000 }, 'audit totals: lost excluded from quoted/open, outstanding = invoiced - received');
  eq(A.auditTotals([au({ stage: 'paid', invoice_amount: 100, paid_amount: 150 })]).outstanding, 0, 'overpayment never makes outstanding negative');
  eq(['lead', 'in_progress', 'report', 'invoiced', 'paid'].map((s) => A.isAuditComplete({ stage: s as never })), [false, false, true, true, true], 'audit counts toward a goal once the report is delivered');

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main();
