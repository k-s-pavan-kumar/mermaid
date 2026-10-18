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

  // ---- 6. tags & fields ---------------------------------------------------
  const T = await import('../src/features/tags/types');
  const TQ = await import('../src/features/tags/queries');
  const TS = await import('../src/features/tags/service');
  eq(T.normaliseTagName('  Mobile   game '), 'Mobile game', 'tag name trimmed + single spaces');
  eq(T.fieldHref({ id: 'abc', special: null }), '/fields/abc', 'field page path');
  eq(T.fieldHref({ id: 'abc', special: 'tpn' }), '/tpn-audits', 'TPN field lives on the TPN page');
  const first = await TQ.getTags('tagger');
  eq(first.map((t) => t.name), ['SaaS', 'Gaming', 'Book Publishing', 'TPN Auditing', 'Bug Bounty', 'Digital Marketing'], 'first visit seeds the six starter fields, in order');
  eq(first.every((t) => t.is_field), true, 'starter fields are fields');
  eq(first.find((t) => t.special === 'tpn')?.name, 'TPN Auditing', 'TPN field is marked special');
  await Promise.all([TQ.getTags('tagger'), TQ.getTags('tagger'), TQ.getTags('tagger')]);
  eq((await TQ.getTags('tagger')).length, 6, 'concurrent loads do not double-seed');
  await TS.ensureTagNames('tagger', ['Photography', 'photography', 'saas', '  ', 'Legal']);
  const after = await TQ.getTags('tagger');
  eq(after.filter((t) => !t.is_field).map((t) => t.name), ['Legal', 'Photography'], 'typed tags become plain tags once, case-insensitively, never duplicating a field');
  eq((await TQ.getFields('tagger')).length, 6, 'plain tags are not fields');
  eq((await TQ.getTags('someone-new')).length, 6, 'each owner gets their own starter set');

  // ---- 7. products (SaaS + app + book + game + marketing) ---------------
  const PR = await import('../src/features/products/types');
  const PS = await import('../src/features/projects/service');
  eq(PR.ROLES.map((r) => r.role), ['saas', 'app', 'book', 'game', 'marketing'], 'a product has SaaS, app, book, game and marketing pieces');
  eq(PR.LANES.map((l) => l.label), ['Tech', 'Education', 'Fun to learn', 'Marketing'], 'four lanes');
  eq(PR.LANES.flatMap((l) => l.roles).sort(), ['app', 'book', 'game', 'marketing', 'saas'], 'every role sits in exactly one lane');
  eq(PR.ROLES.find((r) => r.role === 'book')?.fieldName, 'Publishing', 'book files under the Publishing field');
  eq(PR.productProgress(['done', 'ontrack', 'dropped', 'done']), 67, 'progress ignores dropped pieces');
  eq(PR.productProgress([]), 0, 'empty product = 0%');
  eq(PR.isProductRole('game') && !PR.isProductRole('hack'), true, 'role validation');
  const made = await PS.createProjectRecord('me', { name: 'ISM — Game', type: 'game', productId: 'prod1', productRole: 'game', fieldId: 'f1' });
  eq([made.project.type, made.project.product_id, made.project.product_role, made.project.field_id, made.usedFallback], ['game', 'prod1', 'game', 'f1', false], 'piece is created with product, role and field');
  const bad = await PS.createProjectRecord('me', { name: 'x', type: 'nonsense' });
  eq(bad.project.type, 'internal', 'unknown type falls back to internal');

  // ---- 8. yearly amount targets -----------------------------------------
  const TG = await import('../src/features/targets/compute');
  const ctx = {
    fields: [
      { id: 'saas', name: 'SaaS', special: null }, { id: 'tpn', name: 'TPN Auditing', special: 'tpn' as const },
      { id: 'bb', name: 'Bug Bounty', special: 'bounty' as const }, { id: 'mkt', name: 'Digital Marketing', special: null },
    ],
    projectField: new Map<string, string | null>([['pSaas', 'saas'], ['pNone', null]]),
    invoices: new Map([
      ['i1', { project_id: 'pSaas', client_id: null, stream: 'product' }],
      ['i2', { project_id: null, client_id: 'c1', stream: 'freelance' }],
      ['i3', { project_id: null, client_id: null, stream: 'bounty' }],
      ['i4', { project_id: 'pNone', client_id: 'c2', stream: 'freelance' }],
    ]),
    clientTags: new Map([['c1', ['Digital Marketing', 'web']], ['c2', ['photography']]]),
  };
  const inc = (id: string, date: string, amount: number, over: Record<string, unknown> = {}) => ({ id, date, amount, source: 'invoice_payment', ...over });
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_invoice_id: 'i1' }), ctx), 'saas', "invoice on an own project -> that project's field");
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_project_id: 'pSaas' }), ctx), 'saas', 'entry linked to a project -> its field');
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_invoice_id: 'i2' }), ctx), 'mkt', "client invoice with no project -> field named in the client's tags");
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_invoice_id: 'i3' }), ctx), 'bb', 'bounty-stream invoice -> Bug Bounty');
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { source: 'bounty_payout', linked_bounty_id: 'b1' }), ctx), 'bb', 'bounty payout -> Bug Bounty');
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_invoice_id: 'i4' }), ctx), null, 'no matching field -> counts nowhere');
  const monthly = TG.monthlyByField([
    inc('1', '2026-01-10', 1000, { linked_invoice_id: 'i1' }), inc('2', '2026-01-20', 500, { linked_invoice_id: 'i1' }),
    inc('3', '2026-03-05', 2000, { linked_invoice_id: 'i1' }), inc('4', '2025-12-31', 9999, { linked_invoice_id: 'i1' }),
    inc('5', '2026-02-02', 700, { source: 'bounty_payout', linked_bounty_id: 'b' }), inc('6', '2026-02-03', 123, { linked_invoice_id: 'i4' }),
  ], ctx, 2026);
  eq(monthly.get('saas')?.slice(0, 4), [1500, 0, 2000, 0], 'received is bucketed by month; other years ignored');
  eq(monthly.get('bb')?.[1], 700, 'bounty payout in February');
  TG.addAuditPayments(monthly, 'tpn', [{ paid_amount: 40000, paid_on: '2026-03-15' }, { paid_amount: 5, paid_on: null }, { paid_amount: 9, paid_on: '2025-03-15' }], 2026);
  eq(monthly.get('tpn')?.[2], 40000, 'TPN audit payments count in the month they were paid');
  eq(TG.nowIndex(2026, '2026-10-18'), 9, 'current month index');
  eq([TG.nowIndex(2025, '2026-10-18'), TG.nowIndex(2027, '2026-10-18')], [11, -1], 'past year is complete, future year not started');
  const sm = TG.summarise(120000, [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 0, 0], 9);
  eq([sm.reached, sm.pending, sm.pct, sm.expectedToDate, sm.gap], [100000, 20000, 83, 100000, 0], 'reached, pending, percent and plan-to-date');
  eq(sm.neededPerMonth, 6667, 'needed per remaining month: 20,000 over Oct–Dec');
  eq([sm.cumulative[9], sm.cumulative[10]], [100000, null], 'future months have no running total');
  eq(TG.summarise(1000, [2000, ...Array(11).fill(0)], 11).pending, 0, 'over-achieving never gives negative pending');
  eq(TG.summarise(0, Array(12).fill(0), 5).pct, 0, 'no target = 0%');
  eq(TG.summarise(1200, Array(12).fill(0), 11).neededPerMonth, null, 'no monthly ask once the year is over');
  eq(TG.sumMonthly([[1, 2, ...Array(10).fill(0)], [3, 4, ...Array(10).fill(0)]]).slice(0, 3), [4, 6, 0], 'all-fields series adds up');
  eq(T.fieldHref({ id: 'x', special: 'bounty' }), '/bounty-pipeline', 'bug bounty field points at the bounty page');
  eq([T.fieldProjectType({ name: 'SaaS', special: null }), T.fieldProjectType({ name: 'Gaming', special: null }), T.fieldProjectType({ name: 'Book Publishing', special: null }), T.fieldProjectType({ name: 'Digital Marketing', special: null })], ['web', 'game', 'content', 'marketing'], 'new project in a field starts as the matching type');
  const tqNew = await TQ.getTags('fresh-owner');
  eq(tqNew.map((t) => t.name), ['SaaS', 'Gaming', 'Book Publishing', 'TPN Auditing', 'Bug Bounty', 'Digital Marketing'], 'new accounts get the six fields in sidebar order');
  const withClient = await PS.createProjectRecord('me', { name: 'Acme site', type: 'client', extraTypes: ['web'], clientId: 'c9', fieldId: 'f2' });
  eq([withClient.project.type, withClient.project.types, withClient.project.client_id], ['client', ['client', 'web'], 'c9'], 'client project keeps client + field type');

  // ---- 9. one rule for invoiced / paid / outstanding --------------------
  const B = await import('../src/features/billing/types');
  const invc = (over: Record<string, unknown>) => ({
    id: 'i', owner_id: 'me', project_id: 'p', client_id: null, stream: 'freelance', number: 'IN-1', description: null, items: [],
    amount: 7000, tax_pct: 0, currency: 'INR', notes: null, issued_at: '2026-08-28', quote_id: null, status: 'pending', due_at: null,
    paid_at: null, tds_amount: 0, ...over,
  }) as import('../src/features/billing/types').Invoice;
  eq(B.invoiceMoney(invc({ status: 'paid' }), 0), { billed: 7000, cleared: 7000, outstanding: 0, unrecorded: 7000 }, 'invoice marked paid with no payment on file: paid in full, flagged as unrecorded (the screenshot case)');
  eq(B.invoiceMoney(invc({ status: 'paid' }), 7000), { billed: 7000, cleared: 7000, outstanding: 0, unrecorded: 0 }, 'paid and fully recorded');
  eq(B.invoiceMoney(invc({ status: 'pending' }), 0), { billed: 7000, cleared: 0, outstanding: 7000, unrecorded: 0 }, 'pending: all outstanding');
  eq(B.invoiceMoney(invc({ status: 'partial' }), 3000), { billed: 7000, cleared: 3000, outstanding: 4000, unrecorded: 0 }, 'partial: billed = cleared + outstanding');
  eq(B.invoiceMoney(invc({ status: 'draft' }), 0), { billed: 0, cleared: 0, outstanding: 0, unrecorded: 0 }, 'draft counts for nothing');
  eq(B.invoiceMoney(invc({ tax_pct: 18, status: 'pending' }), 0).billed, 8260, 'tax is included in what is billed');
  eq(B.invoiceMoney(invc({ status: 'paid', tds_amount: 700 }), 6300), { billed: 7000, cleared: 7000, outstanding: 0, unrecorded: 0 }, 'paid net of TDS is fully settled, nothing unrecorded');
  eq(B.invoiceMoney(invc({ status: 'partial', tds_amount: 700 }), 6300).outstanding, 0, 'partial that covers the net-of-TDS amount leaves nothing outstanding');
  const tot = B.sumInvoiceMoney([invc({ id: 'a', status: 'paid' }), invc({ id: 'b', status: 'partial' }), invc({ id: 'c', status: 'pending', amount: 1000 }), invc({ id: 'd', status: 'draft' })], new Map([['a', 7000], ['b', 2500]]));
  eq([tot.billed, tot.cleared, tot.outstanding, tot.unrecorded], [15000, 9500, 5500, 0], 'totals across invoices');
  eq(tot.billed, tot.cleared + tot.outstanding, 'invoiced always equals paid + outstanding');

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main();
