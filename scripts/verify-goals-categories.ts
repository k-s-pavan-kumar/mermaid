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

  // ---- 10. tag icons, pie geometry, client-project attribution ----------
  const IC = await import('../src/features/tags/icons');
  eq(new Set(IC.ICON_KEYS).size === IC.ICON_KEYS.length && IC.ICON_KEYS.length >= 20, true, 'icon keys are unique and there is a real choice');
  eq(IC.TAG_ICONS.every((i) => i.paths.length > 0 && i.paths.every((d) => d.startsWith('M'))), true, 'every icon is drawn from path data');
  eq([IC.defaultIconFor({ name: 'SaaS', special: null }), IC.defaultIconFor({ name: 'Gaming', special: null }), IC.defaultIconFor({ name: 'Book Publishing', special: null }),
      IC.defaultIconFor({ name: 'x', special: 'tpn' }), IC.defaultIconFor({ name: 'x', special: 'bounty' }), IC.defaultIconFor({ name: 'Digital Marketing', special: null }), IC.defaultIconFor({ name: 'Whatever', special: null })],
     ['cloud', 'gamepad', 'book', 'shield', 'bug', 'megaphone', 'tag'], 'default icon follows the name');
  eq(IC.iconKeyFor({ name: 'SaaS', special: null, icon: 'rocket' }), 'rocket', 'a chosen icon wins');
  eq(IC.iconKeyFor({ name: 'SaaS', special: null, icon: 'not-an-icon' }), 'cloud', 'an unknown stored icon falls back to the default');
  const CH = await import('../src/features/targets/components/charts');
  const quarter = CH.pieSlicePath(0, 25);
  eq(quarter.startsWith('M16,16 L16.000,0.000 A16,16 0 0 1 32.000,16.000'), true, 'a 25% slice runs from 12 o\'clock to 3 o\'clock');
  eq(CH.pieSlicePath(0, 60).includes('0 1 1'), true, 'a slice over half the pie uses the large-arc flag');
  const cpf = TG.clientProjectFields([{ client_id: 'a', field_id: 'x' }, { client_id: 'a', field_id: 'y' }, { client_id: 'a', field_id: 'y' }, { client_id: 'b', field_id: null }, { client_id: null, field_id: 'x' }]);
  eq([cpf.get('a'), cpf.has('b')], ['y', false], "a client's field is the one most of their projects sit in");
  eq(TG.fieldForIncome(inc('a', '2026-03-01', 1, { linked_invoice_id: 'i4' }), { ...ctx, clientProjectField: new Map([['c2', 'mkt']]) }), 'mkt', "client invoice with no project or tag -> the field of the client's projects");

  // ---- 11. outstanding per field, pending split, overall progress -------
  eq(TG.pipeline(5884, 2000), { stillToInvoice: 3884, covered: false }, 'pending splits into outstanding (invoiced) and still-to-invoice');
  eq(TG.pipeline(5884, 9000), { stillToInvoice: 0, covered: true }, 'outstanding can fully cover what is pending');
  eq(TG.pipeline(0, 500).covered, false, 'nothing pending = nothing to cover');
  const ov = TG.overallProgress([
    { target: 100000, reached: 270300, pending: 0, outstanding: 0 },       // over goal
    { target: 100000, reached: 35000, pending: 65000, outstanding: 20000 },
    { target: 100000, reached: 95616, pending: 4384, outstanding: 1000 },
    { target: 0, reached: 50000, pending: 0, outstanding: 7000 },            // no goal: left out
  ]);
  eq([ov.target, ov.counted, ov.pending, ov.over, ov.outstanding, ov.pct], [300000, 230616, 69384, 170300, 21000, 77], "a field over its goal counts only up to that goal, so it can't hide another field's shortfall");

  const OW = 'out-owner';
  const ownerFields = await TQ.getFields(OW);
  const saasId = ownerFields.find((f) => f.name === 'SaaS')!.id;
  const mktId = ownerFields.find((f) => f.name === 'Digital Marketing')!.id;
  await table('projects').insert({ id: 'op1', owner_id: OW, name: 'Own SaaS', type: 'web', types: ['web'], client_id: null, status: 'ontrack', description: null, created_at: '', field_id: saasId } as never);
  await table('clients').insert({ id: 'oc1', owner_id: OW, name: 'Mkt Client', work_types: ['Digital Marketing'] } as never);
  const mkInv = (over: Record<string, unknown>) => ({ owner_id: OW, project_id: null, client_id: null, stream: 'freelance', number: 'N', description: null, items: [], amount: 5000, tax_pct: 0, currency: 'INR', notes: null, issued_at: '2026-09-01', quote_id: null, status: 'pending', due_at: null, paid_at: null, tds_amount: 0, ...over }) as never;
  await table('invoices').insert(mkInv({ id: 'oi1', project_id: 'op1' }));                                  // 5000 unpaid on own SaaS project
  await table('invoices').insert(mkInv({ id: 'oi2', client_id: 'oc1', amount: 8000, status: 'partial' }));   // 8000, 3000 paid -> 5000 owed, via client tag
  await table('invoices').insert(mkInv({ id: 'oi3', project_id: 'op1', status: 'paid', amount: 4000 }));    // paid: owes nothing
  await table('invoices').insert(mkInv({ id: 'oi4', project_id: 'op1', status: 'draft', amount: 9000 }));   // draft: counts for nothing
  await table('invoices').insert(mkInv({ id: 'oi5', amount: 700 }));                                         // no project/client: in no field
  await table('finance_entries').insert({ id: 'oe1', owner_id: OW, type: 'income', source: 'invoice_payment', amount: 3000, date: '2026-09-10', category: 'Freelance', linked_invoice_id: 'oi2' } as never);
  const TQY = await import('../src/features/targets/queries');
  const td = await TQY.loadTargetData(OW, 2026);
  eq(td.outstanding.get(saasId), 5000, 'unpaid invoice on an own project is outstanding for that project\'s field (paid and draft ones are not)');
  eq(td.outstanding.get(mktId), 5000, "partly-paid client invoice: only the unpaid 5,000 is outstanding, credited via the client's field tag");
  eq(td.monthly.get(mktId)?.[8], 3000, 'and its 3,000 payment is reached in September, in the same field');

  // ---- 12. the 12 additions: shape, forecast, aging, profit, tax, launch, checklist, tags, digest ----
  const wts = TG.planShares([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  eq([Math.round(wts[0]! * 1200) / 100, wts[11]], [1, 1], 'even weights give a straight plan ending at 100%');
  const back = TG.planShares([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 13]);
  eq(back[10]! < 0.5 && back[11] === 1, true, 'a December-heavy shape keeps the plan low until the end');
  eq(TG.planShares([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])[5], 0.5, 'invalid / all-zero weights fall back to even');
  const shaped = TG.summariseShaped(120000, Array(12).fill(0), 5, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 13]);
  eq(shaped.expectedToDate, 30000, 'back-loaded plan expects only 6/24 of the target by the end of June (an even plan expects half)');
  eq(TG.summariseShaped(120000, Array(12).fill(0), 5).expectedToDate, 60000, 'no weights: the straight-line plan, half the target by the end of June');
  const fc = TG.forecast(120000, 50000, 10000, 2026, '2026-06-16'); // 5.53 months elapsed
  eq([fc.basis, fc.projected, fc.onPace, fc.toBill], ['run-rate', 108433.73, false, 60000], 'forecast carries the run-rate to December; toBill = pending minus outstanding');
  eq(TG.forecast(100000, 100000, 0, 2025, '2026-06-16'), { projected: 100000, shortBy: 0, onPace: true, toBill: 0, basis: 'final' }, 'a past year is final');
  eq(TG.forecast(100000, 0, 0, 2027, '2026-06-16').basis, 'none', 'a future year has no forecast');
  eq([TG.agingBucket(-5), TG.agingBucket(0), TG.agingBucket(1), TG.agingBucket(30), TG.agingBucket(31), TG.agingBucket(60), TG.agingBucket(61)], ['notdue', 'notdue', 'd30', 'd30', 'd60', 'd60', 'd60plus'], 'aging buckets');
  const rcv = TG.makeReceivable({ id: 'x', number: 'INV-9', who: 'Aruna', owed: 20000, issued: '2026-08-01', due: '2026-09-01', fieldId: null, href: null }, '2026-10-19');
  eq([rcv.daysLate, rcv.bucket], [48, 'd60'], 'days late are counted from the due date');
  eq(TG.makeReceivable({ id: 'y', number: 'N', who: '', owed: 1, issued: '2026-10-01', due: null, fieldId: null, href: null }, '2026-10-19').daysLate, 18, 'no due date: counted from the issue date');
  eq(TG.reminderText(rcv, 'Pavan').includes('INV-9') && TG.reminderText(rcv).includes('₹20,000') && TG.reminderText(rcv).includes('48 days past'), true, 'reminder names the invoice, amount and lateness');
  eq(TG.agingTotals([rcv, { ...rcv, id: 'z', owed: 500 }])['d60'], { count: 2, amount: 20500 }, 'aging totals');
  eq(TG.profitOf(100000, 30000), { revenue: 100000, costs: 30000, profit: 70000, marginPct: 70 }, 'profit and margin');
  eq(TG.profitOf(0, 500).marginPct, null, 'no revenue = no margin');
  eq([TG.effectiveRate(60000, 600), TG.effectiveRate(0, 600), TG.effectiveRate(5000, 0)], [6000, null, null], 'effective hourly rate');
  eq(TG.recentMonthlyAverage([0, 0, 0, 0, 0, 0, 0, 3000, 6000, 9000, 0, 0], 9), 6000, 'MRR = average of the last three months');

  const TX = await import('../src/features/tax/compute');
  eq([TX.fyOf('2026-03-31'), TX.fyOf('2026-04-01'), TX.fyOf('2026-12-31')], [2025, 2026, 2026], 'Indian financial year boundaries');
  eq([TX.fyLabel(2026), TX.fyMonths(2026)[0], TX.fyMonths(2026)[11]], ['FY 2026-27', '2026-04', '2027-03'], 'FY label and months run April to March');
  const taxInv = (over: Record<string, unknown>) => ({ id: 'i', owner_id: 'me', project_id: null, client_id: 'c1', stream: 'freelance', number: 'N', description: null, items: [], amount: 10000, tax_pct: 18, currency: 'INR', notes: null, issued_at: '2026-05-10', quote_id: null, status: 'pending', due_at: null, paid_at: null, tds_amount: 0, ...over }) as never;
  const ts = TX.taxSummary([taxInv({}), taxInv({ id: 'j', tds_amount: 1000, tax_pct: 0, issued_at: '2026-05-20' }), taxInv({ id: 'k', status: 'draft' }), taxInv({ id: 'l', issued_at: '2027-04-02' }), taxInv({ id: 'm', issued_at: '2026-03-31' }), taxInv({ id: 'n', issued_at: '2027-02-01', tax_pct: 0, amount: 5000 })], new Map([['c1', 'Acme']]), 2026);
  eq([ts.totals.invoices, ts.totals.taxable, ts.totals.gst, ts.totals.tds, ts.totals.billed], [3, 25000, 1800, 1000, 26800], 'tax totals: this FY only (Apr 2026–Mar 2027); drafts and other FYs excluded');
  eq([ts.months[1]!.month, ts.months[1]!.invoices, ts.months[1]!.gst], ['2026-05', 2, 1800], 'monthly row');
  eq([ts.quarters[0]!.gst, ts.quarters[3]!.taxable], [1800, 5000], 'quarters: Apr-Jun and Jan-Mar');
  eq([ts.byClient[0]!.name, ts.byClient[0]!.tds], ['Acme', 1000], 'TDS by client');
  const csv = TX.taxCsv(ts, new Set(['c1']));
  eq(csv.includes('Month,Invoices,Taxable value') && csv.includes('Acme,3,26800,1000,Yes'), true, 'CSV has both sections and the 26AS tick');
  eq(TX.taxCsv({ ...ts, byClient: [{ clientId: null, name: 'A, "B"', invoices: 1, billed: 1, tds: 0 }] }, new Set()).includes('"A, ""B"""'), true, 'CSV escapes commas and quotes');

  const LN = await import('../src/features/launch/compute');
  const piece = (over: Record<string, unknown>) => ({ id: 'p', name: 'Book', role: 'book', status: 'ontrack', milestonesDone: 0, milestonesTotal: 0, tasksDone: 0, tasksOpen: 0, ...over }) as never;
  eq([LN.pieceReadiness(piece({ status: 'done' })), LN.pieceReadiness(piece({})), LN.pieceReadiness(piece({ milestonesDone: 2, milestonesTotal: 4, tasksDone: 5, tasksOpen: 5 }))], [100, 45, 48], 'readiness: done=100, status guess, or measured from milestones + tasks');
  eq(LN.launchPlan(null, '2026-10-19', [piece({})]).verdict, 'no-date', 'no launch date');
  const lp = LN.launchPlan('2026-10-26', '2026-10-19', [piece({ id: 'a', name: 'SaaS', status: 'done' }), piece({ id: 'b', name: 'Game', status: 'ontrack' }), piece({ id: 'c', name: 'Mkt', status: 'review' })]);
  eq([lp.daysToLaunch, lp.verdict, lp.blockers.map((b) => b.name)], [7, 'at-risk', ['Game']], 'a launch a week out with a 45%-ready piece is at risk and names the blocker');
  eq(LN.launchPlan('2026-10-01', '2026-10-19', [piece({})]).verdict, 'late', 'launch date passed, work not done');
  eq(LN.launchPlan('2026-10-01', '2026-10-19', [piece({ status: 'done' })]).verdict, 'launched', 'everything done = launched');
  eq(LN.launchPlan('2027-03-01', '2026-10-19', [piece({})]).verdict, 'on-track', 'plenty of time = on track');

  const CL = await import('../src/features/launch/checklist');
  eq(CL.readChecklist(null).length, CL.DEFAULT_AUDIT_CHECKLIST.length, 'no stored checklist -> the default template');
  const t1 = CL.toggleItem(CL.readChecklist(null), 'd2');
  eq([CL.checklistProgress(t1).done, CL.checklistProgress(t1).pct], [1, 8], 'ticking an item updates progress');
  const t2 = CL.addItem(t1, '  Fire safety cert ', 'x1');
  eq(t2.length, t1.length + 1, 'add a custom item');
  eq(CL.addItem(t2, 'fire safety CERT', 'x2').length, t2.length, 'no duplicate items (case-insensitive)');
  eq(CL.readChecklist([{ id: 1 }, 'junk']).length, CL.DEFAULT_AUDIT_CHECKLIST.length, 'junk in storage falls back to the template');

  const TOPS = await import('../src/features/tags/ops');
  eq(TOPS.replaceTagInList(['web', 'Publishing', 'Photography'], 'publishing', 'Book Publishing'), ['web', 'Book Publishing', 'Photography'], 'rename inside a client tag list');
  eq(TOPS.replaceTagInList(['Publishing', 'Book Publishing'], 'Publishing', 'Book Publishing'), ['Book Publishing'], 'merge collapses duplicates');
  eq([TOPS.renameProblem('', []), TOPS.renameProblem('saas', ['SaaS']) !== null, TOPS.renameProblem('New', ['SaaS'])], ['Type a name.', true, null], 'rename validation');

  const DG = await import('../src/features/targets/digest');
  const dtxt = DG.digestText({ weekLabel: 'week of 19 Oct', receivedThisWeek: 25000, payments: [{ label: 'INV-1 · Acme', amount: 25000 }],
    fields: [{ name: 'SaaS', target: 100000, reached: 40000, pct: 40, onPace: false, toBill: 30000 }, { name: 'Gaming', target: 0, reached: 0, pct: 0, onPace: null, toBill: 0 }],
    chasing: [{ number: 'INV-9', who: 'Aruna', owed: 20000, daysLate: 48 }], comingUp: ['Launch of ISM in 7 days'] });
  eq(['Received this week: ₹25,000', 'SaaS: ₹40,000 of ₹1,00,000 (40%) · behind pace · still to bill ₹30,000', 'INV-9 · Aruna — ₹20,000, 48d late', 'Launch of ISM in 7 days'].every((x) => dtxt.includes(x)) && !dtxt.includes('Gaming'), true, 'digest text covers money, targets, chasing and upcoming');

  // ---- 13. calendar dates, view model, converted audits ------------------
  const CD = await import('../src/features/calendar/dates');
  const evs = CD.datedEvents({
    from: '2026-10-19', to: '2026-10-25',
    audits: [{ id: 'a1', client_name: 'Acme', company: 'Acme Studios', audit_date: '2026-10-22', stage: 'accepted' }, { id: 'a2', client_name: 'Gone', company: null, audit_date: '2026-10-23', stage: 'lost' }, { id: 'a3', client_name: 'Later', company: null, audit_date: '2026-11-02', stage: 'lead' }],
    products: [{ id: 'p1', name: 'ISM', launch_date: '2026-10-25' }, { id: 'p2', name: 'Other', launch_date: null }],
    openInvoices: [{ id: 'i1', number: 'INV-7', due_at: '2026-10-21', owed: 5000, who: 'Aruna' }, { id: 'i2', number: 'INV-8', due_at: '2026-10-21', owed: 0, who: '' }],
  });
  eq(evs.map((e) => `${e.date} ${e.kind}`), ['2026-10-21 due', '2026-10-22 audit', '2026-10-25 launch'], 'calendar strip: in-range audits, launches and unpaid dues only (lost audits and paid invoices left out), in date order');
  eq(evs[0]!.label, 'Due · INV-7 (Aruna) · ₹5,000', 'due label');

  const VW = await import('../src/features/targets/view');
  const VD = await TQY.loadTargetData(OW, 2026);
  const vv = VW.fieldView(saasId, VD, 2026, '2026-10-19');
  eq([vv.outstanding, vv.target, vv.receivables.length], [5000, 0, 1], 'fieldView ties outstanding, target and receivables together');
  eq(vv.receivables[0]?.number, 'N', "receivables carry the invoice's number");
  eq(VD.receivables.filter((r) => r.fieldId === null).length, 1, 'an invoice in no field is still listed (so it can be chased and assigned)');

  const AUD = await import('../src/features/audits/types');
  const aud = (over: Record<string, unknown>) => ({ id: 'z', owner_id: 'me', client_name: 'C', company: null, email: null, phone: null, scope: null, stage: 'invoiced', quote_amount: 10000, quote_sent_on: null, quote_ref: null, invoice_amount: 10000, invoice_ref: null, invoice_sent_on: null, paid_amount: 2000, paid_on: null, audit_date: null, goal_id: null, goal_month: null, notes: null, created_at: '', ...over }) as never;
  const atot = AUD.auditTotals([aud({}), aud({ billing_invoice_id: 'inv-x' })]);
  eq([atot.invoiced, atot.received, atot.outstanding, atot.quoted], [10000, 2000, 8000, 20000], 'an audit invoiced in Billing is not counted twice in the audit totals');

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main();
