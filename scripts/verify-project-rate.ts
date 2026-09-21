import { projectTime } from '../src/features/projects/time';

let failed = 0;
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
  if (!ok) failed++;
}

// 2h + 90min on tasks = 3.5h; ₹35,000 invoiced, ₹21,000 collected.
let t = projectTime({
  tasks: [{ logged_minutes: 120 }, { logged_minutes: 90 }, {}],
  sessions: [],
  invoiced: 35000, collected: 21000, agreedCost: 50000,
});
eq(t.hours, 3.5, 'task minutes sum to hours');
eq(t.rateInvoiced, 10000, 'invoiced ÷ hours');
eq(t.rateCollected, 6000, 'collected ÷ hours');
eq(t.rateOnAgreedCost, 14286, 'agreed cost ÷ hours');

// A session on a task is already inside that task's minutes → not counted twice.
t = projectTime({
  tasks: [{ logged_minutes: 60 }],
  sessions: [{ task_id: 'x', completed_minutes: 60 }, { task_id: null, completed_minutes: 30 }],
  invoiced: 1500, collected: 0,
});
eq(t.hours, 1.5, 'task-linked sessions skipped, loose sessions added');
eq(t.rateCollected, null, 'no money collected → no rate, not ₹0');

// No time logged → never divide by zero.
t = projectTime({ tasks: [{ logged_minutes: 0 }], sessions: [], invoiced: 5000, collected: 5000, agreedCost: 9000 });
eq([t.hours, t.rateInvoiced, t.rateCollected, t.rateOnAgreedCost], [0, null, null, null], 'zero hours gives null rates');

// Negative / garbage never subtracts hours.
t = projectTime({ tasks: [{ logged_minutes: -50 }, { logged_minutes: 60 }], sessions: [], invoiced: 100, collected: 100 });
eq(t.hours, 1, 'negative minutes ignored');

if (failed) { console.log(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
