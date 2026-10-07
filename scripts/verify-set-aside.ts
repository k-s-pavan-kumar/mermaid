/**
 * Sister's share (added by hand, per invoice — never automatic) + the plain
 * investment log. Run against a throw-away local DB.
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
  fs.writeFileSync(path.join(tmp, 'data', 'db.local.json'), JSON.stringify({ finance_entries: [], finance_investment_log: [] }));
  process.chdir(tmp);
  process.env.DATA_PROVIDER = 'local';

  const S = await import('../src/features/daily-finance/set-aside');
  const Q = await import('../src/features/daily-finance/queries');
  const { table } = await import('../src/lib/data');
  type E = import('../src/features/daily-finance/types').FinanceEntry;
  const me = 'me';
  const entries = async () => table<E>('finance_entries').all();
  const shares = async () => (await entries()).filter((e) => e.source === 'invoice_split');
  const pay = (id: string, invoiceId: string, amount: number): E => ({
    id, owner_id: me, date: '2026-10-07', type: 'income', category: 'Client payment', amount, note: 'x',
    source: 'invoice_payment', created_at: '', linked_invoice_id: invoiceId,
  });
  const give = (invoiceId: string, pct: number, received: number) =>
    S.setInvoiceShare({ ownerId: me, invoiceId, invoiceNumber: `INV-${invoiceId}`, pct, received, today: '2026-10-08' });

  // ---- maths
  eq(S.splitShare(100_000, 10), 10_000, '10% of ₹1,00,000 = ₹10,000');
  eq(S.splitShare(33_333.33, 10), 3_333.33, 'rounds to the paisa');

  // ---- nothing is automatic
  await table<E>('finance_entries').insert(pay('p1', 'a', 80_000));
  await Q.insertIncomeEntry({ ownerId: me, date: '2026-10-08', category: 'Client payment', amount: 50_000, note: 'retainer', source: 'invoice_payment', linkedInvoiceId: 'ret' });
  eq((await shares()).length, 0, 'recording payments (incl. a retainer) gives the sister nothing on its own');

  // ---- giving a share, by hand, on invoice "a" only
  eq((await give('a', 0, 80_000)).ok, false, '0% rejected');
  eq((await give('a', 150, 80_000)).ok, false, 'over 100% rejected');
  eq((await give('b', 10, 0)).ok, false, 'nothing received yet → nothing to take a share of');
  eq((await give('a', 10, 80_000)).ok, true, 'give 10% on invoice a');
  eq((await shares()).map((e) => [e.linked_invoice_id, e.category, e.amount, e.type]), [['a', 'Family — Sister', 8_000, 'expense']], '₹8,000 expense, filed under Family — Sister, on invoice a only');
  eq((await shares())[0]!.note?.includes('INV-a'), true, 'note names the invoice');

  // ---- one per invoice: pressing again changes it rather than doubling it
  await give('a', 12.5, 80_000);
  eq((await shares()).map((e) => [e.amount, e.split_pct]), [[10_000, 12.5]], 'giving again re-sets the one share (12.5% → 10,000), no duplicate');

  // ---- follows the invoice when what was received changes
  await S.resyncInvoiceShare(me, 'a', 72_000); // TDS correction / extra payment / deleted payment
  eq((await shares())[0]!.amount, 9_000, 'received changes to 72,000 → share follows (12.5% = 9,000)');
  await S.resyncInvoiceShare(me, 'ret', 50_000);
  eq((await shares()).length, 1, 'resync never creates a share on an invoice the person skipped');
  await S.resyncInvoiceShare(me, 'a', 0);
  eq((await shares()).length, 0, 'all payments deleted → the share goes too');

  // ---- remove by hand
  await give('a', 10, 80_000);
  eq(await S.removeInvoiceShare(me, 'a'), true, 'remove the share');
  eq((await shares()).length, 0, 'gone from the ledger');
  eq(await S.removeInvoiceShare(me, 'a'), false, 'removing again is a no-op');

  // ---- totals for the finance page
  await give('a', 10, 80_000);
  await table<E>('finance_entries').insert(pay('p2', 'c', 20_000));
  await give('c', 10, 20_000);
  eq(await S.getSisterTotal(me, '2026-10-01', '2026-10-31'), 10_000, 'month total given = 8,000 + 2,000');
  eq(await S.getSisterTotal(me, '2026-11-01', '2026-11-30'), 0, 'other months are 0');

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
