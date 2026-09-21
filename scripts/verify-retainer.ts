import { retainerMonths, retainerSummary, periodsBetween, periodLabel } from '../src/features/retainer/logic';

let failed = 0;
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
  if (!ok) failed++;
}

const client = { billing_type: 'monthly' as const, monthly_fee: 15000, retainer_start: '2026-07-01', retainer_due_day: 5 };
const paid = (period: string, paid_at: string, amount = 15000) =>
  ({ period, status: 'paid' as const, paid_at, items: [], amount, tax_pct: 0 });

eq(periodsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'], 'periods roll over the year end');
eq(periodLabel('2026-09'), 'September 2026', 'label');

// Today 21 Sep 2026: Jul received, Aug NOT received, Sep not received (due 5th, passed).
let m = retainerMonths(client, [paid('2026-07', '2026-07-06')] as any, '2026-09-21');
eq(m.map((x) => [x.period, x.state]), [['2026-09', 'overdue'], ['2026-08', 'overdue'], ['2026-07', 'received']], 'newest first; unreceived months past due are overdue');
eq(m[2]!.receivedOn, '2026-07-06', 'received date carried');
const s = retainerSummary(m);
eq([s.receivedTotal, s.overdueTotal, s.overdueCount], [15000, 30000, 2], 'summary totals');

// Before the due day: current month is pending, not overdue.
m = retainerMonths(client, [paid('2026-07', '2026-07-06'), paid('2026-08', '2026-08-02')] as any, '2026-09-03');
eq(m[0]!.state, 'pending', 'before due day → pending');
m = retainerMonths(client, [paid('2026-07', '2026-07-06'), paid('2026-08', '2026-08-02')] as any, '2026-09-05');
eq(m[0]!.state, 'pending', 'on the due day itself → still pending');
m = retainerMonths(client, [paid('2026-07', '2026-07-06'), paid('2026-08', '2026-08-02')] as any, '2026-09-06');
eq(m[0]!.state, 'overdue', 'day after due day → overdue');

// A received month shows what was actually received, not the fee.
m = retainerMonths(client, [paid('2026-09', '2026-09-02', 12000)] as any, '2026-09-21');
eq(m[0]!.amount, 12000, 'received amount can differ from the fee');

// An unpaid invoice for the month (not received) is still not "received".
m = retainerMonths(client, [{ period: '2026-09', status: 'pending', paid_at: null, items: [], amount: 15000, tax_pct: 0 }] as any, '2026-09-21');
eq(m[0]!.state, 'overdue', 'unpaid invoice ≠ received');

// Start month in the future → nothing expected yet. Project clients → nothing.
eq(retainerMonths({ ...client, retainer_start: '2026-11-01' }, [], '2026-09-21'), [], 'future start → no months');
eq(retainerMonths({ ...client, billing_type: 'project' as any }, [], '2026-09-21'), [], 'project client → no retainer months');
eq(retainerMonths({ billing_type: undefined as any, monthly_fee: null, retainer_start: null, retainer_due_day: null }, [], '2026-09-21'), [], 'legacy client without billing_type is safe');

// Bad due day is clamped.
m = retainerMonths({ ...client, retainer_due_day: 99 }, [], '2026-07-29');
eq(m[0]!.dueDate, '2026-07-28', 'due day clamped to 28');

if (failed) { console.log(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
