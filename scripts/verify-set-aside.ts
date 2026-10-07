/**
 * Set-asides (sister %) + the plain investment log: the share maths
 * (pure) and the posting/undo rules (run against a throw-away local DB).
 * Run:  npm run verify:set-aside
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-setaside-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'data', 'db.local.json'),
    JSON.stringify({ finance_entries: [], finance_split_rules: [], finance_investment_log: [] }));
  process.chdir(tmp);
  process.env.DATA_PROVIDER = 'local';

  const S = await import('../src/features/daily-finance/set-aside');
  const Q = await import('../src/features/daily-finance/queries');
  const { table } = await import('../src/lib/data');
  type E = import('../src/features/daily-finance/types').FinanceEntry;
  type Rule = import('../src/features/daily-finance/types').FinanceSplitRule;
  const me = 'me';
  const entries = async () => table<E>('finance_entries').all();
  const pay = (id: string, amount: number): E => ({
    id, owner_id: me, date: '2026-10-07', type: 'income', category: 'Client payment', amount, note: 'x',
    source: 'invoice_payment', created_at: '', linked_invoice_id: 'inv1',
  });
  const rule = (id: string, pct: number): Rule => ({ id, owner_id: me, label: id, pct, active: true, created_at: '' });

  // ---- pure maths
  eq(S.splitShare(100_000, 10), 10_000, '10% of ₹1,00,000 = ₹10,000');
  eq(S.splitShare(33_333.33, 10), 3_333.33, 'rounds to the paisa');
  eq(S.planSplits(1000, [rule('a', 10), { ...rule('b', 5), active: false }]).map((p) => p.amount), [100], 'paused rules take nothing');
  const third = S.planSplits(100, [rule('a', 33.333), rule('b', 33.333), rule('c', 33.334)]);
  eq(third.reduce((n, p) => n + p.amount, 0) <= 100, true, 'rounding can never over-allocate the payment');

  // ---- rule validation
  const sister = await S.saveSplitRule({ ownerId: me, label: 'Sister', pct: 10 });
  eq(sister.ok, true, 'sister 10% rule saved');
  eq((await S.saveSplitRule({ ownerId: me, label: 'X', pct: 0 })).ok, false, '0% rejected');
  eq((await S.saveSplitRule({ ownerId: me, label: '', pct: 5 })).ok, false, 'a rule needs a name');
  eq((await S.saveSplitRule({ ownerId: me, label: 'Big', pct: 95 })).ok, false, 'rules totalling over 100% rejected');

  // ---- posting
  const p1 = pay('p1', 80_000);
  await table<E>('finance_entries').insert(p1);
  eq(await S.applySplitsForPayment(me, p1, 'INV-001'), 1, 'one payment posts one entry per active rule');
  eq(await S.applySplitsForPayment(me, p1, 'INV-001'), 0, 'idempotent: a retry posts nothing');
  const posted = (await entries()).filter((e) => e.source === 'invoice_split');
  eq(posted.map((e) => [e.category, e.amount, e.type]), [['Family — Sister', 8_000, 'expense']], 'sister gets 10% of 80,000 = 8,000, as an expense');
  eq(posted[0]!.note?.includes('INV-001'), true, 'note names the invoice');

  // ---- a rule added later does not reach back
  await S.saveSplitRule({ ownerId: me, label: 'Mom', pct: 2 });
  await S.resyncSplitsForPayment(me, p1);
  eq((await entries()).filter((e) => e.source === 'invoice_split' && e.linked_payment_id === 'p1').length, 1, 'new rule does not backfill paid invoices');

  // ---- TDS correction: shares follow the net amount, at the % they were posted at
  await S.saveSplitRule({ ownerId: me, id: sister.ok ? sister.id : '', label: 'Sister', pct: 12 });
  await S.resyncSplitsForPayment(me, { ...p1, amount: 72_000 });
  const after = (await entries()).filter((e) => e.source === 'invoice_split' && e.linked_payment_id === 'p1');
  eq(after.map((e) => [e.category, e.amount]), [['Family — Sister', 7_200]], 'TDS fix → 10% of 72,000; later edit of the rule to 12% does not rewrite history');

  // ---- retainer path (insertIncomeEntry) posts splits too, and only once
  await Q.insertIncomeEntry({ ownerId: me, date: '2026-10-08', category: 'Client payment', amount: 50_000, note: 'retainer', source: 'invoice_payment', linkedInvoiceId: 'inv2', invoiceNumber: 'INV-002' });
  await Q.insertIncomeEntry({ ownerId: me, date: '2026-10-08', category: 'Client payment', amount: 50_000, note: 'retainer', source: 'invoice_payment', linkedInvoiceId: 'inv2', invoiceNumber: 'INV-002' });
  const rp = (await entries()).filter((e) => e.source === 'invoice_split' && e.linked_invoice_id === 'inv2');
  eq(rp.reduce((n, e) => n + e.amount, 0), 6_000 + 1_000, 'new payment uses the edited rate: sister 12% + mom 2%, posted once despite a duplicate call');
  const bounty = await Q.insertIncomeEntry({ ownerId: me, date: '2026-10-09', category: 'Bug bounty', amount: 10_000, note: 'b', source: 'bounty_payout', linkedBountyId: 'b1' });
  eq((await entries()).filter((e) => e.linked_bounty_id === 'b1' || e.note === 'b').length, 1, 'bounties are not invoices → no set-aside');

  // ---- deleting a payment takes its shares with it
  await S.removeSplitsForPayment(me, 'p1');
  eq((await entries()).filter((e) => e.linked_payment_id === 'p1').length, 0, 'deleting the payment removes its set-asides');

  // ---- summary for the ledger page
  const sum = await S.getSetAsideSummary(me, '2026-10-01', '2026-10-31');
  eq(sum.family, 6_000 + 1_000, 'month summary: total given');
  eq(sum.byRecipient.map((r) => r.label), ['Sister', 'Mom'], 'recipients, largest first');

  // ---- investment log: plain, standalone, never touches the ledger
  const ledgerBefore = (await entries()).length;
  eq((await S.addInvestmentLogEntry({ ownerId: me, amount: 5_000, investedIn: 'Nifty 50 index fund', date: '2026-10-05' })).ok, true, 'add an investment');
  await S.addInvestmentLogEntry({ ownerId: me, amount: 2_000, investedIn: 'Gold', date: '2026-09-20' });
  eq((await S.addInvestmentLogEntry({ ownerId: me, amount: 0, investedIn: 'X', date: '2026-10-05' })).ok, false, 'zero amount rejected');
  eq((await S.addInvestmentLogEntry({ ownerId: me, amount: 10, investedIn: '  ', date: '2026-10-05' })).ok, false, 'blank "invested in" rejected');
  eq((await S.addInvestmentLogEntry({ ownerId: me, amount: 10, investedIn: 'X', date: 'nope' })).ok, false, 'bad date rejected');
  const log = await S.getInvestmentLog(me);
  eq(log.map((e) => [e.invested_in, e.amount, e.date]), [['Gold', 2_000, '2026-09-20'], ['Nifty 50 index fund', 5_000, '2026-10-05']], 'listed oldest first (stable S.no)');
  eq((await entries()).length, ledgerBefore, 'the log posts nothing to the ledger');
  eq(await S.removeInvestmentLogEntry('someone-else', log[0]!.id), false, "can't delete another owner's entry");
  eq(await S.removeInvestmentLogEntry(me, log[0]!.id), true, 'delete an entry');
  eq((await S.getInvestmentLog(me)).length, 1, 'one left');

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll set-aside checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
