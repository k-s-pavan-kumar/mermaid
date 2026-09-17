import { table, writeDb } from '../src/lib/data/local-store';
import { getAlerts } from '../src/features/notifications/queries';
import type { Project, BountySubmission } from '../src/features/projects/types';
import type { Invoice } from '../src/features/billing/types';
import type { Task } from '../src/features/today/types';

const OWNER = 'test@example.com';
function assert(c: unknown, m: string) {
  if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m);
}
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function main() {
  await table<Project>('projects').insert({
    id: 'p_client', owner_id: OWNER, name: 'Client Work', type: 'client',
    client_id: null, status: 'ontrack', description: null, created_at: new Date().toISOString(),
  });
  await table<Project>('projects').insert({
    id: 'p_bounty', owner_id: OWNER, name: 'Bounty Prog', type: 'bounty',
    client_id: null, status: 'review', description: null, created_at: new Date().toISOString(),
  });
  await table<Project>('projects').insert({
    id: 'p_risk', owner_id: OWNER, name: 'Wobbly Thing', type: 'internal',
    client_id: null, status: 'risk', description: null, created_at: new Date().toISOString(),
  });
  await table<Project>('projects').insert({
    id: 'p_old', owner_id: OWNER, name: 'Long Runner', type: 'internal',
    client_id: null, status: 'ontrack', description: null, created_at: iso(-90) + 'T00:00:00.000Z',
  });

  // overdue invoice
  await table<Invoice>('invoices').insert({
    id: 'i_over', project_id: 'p_client', quote_id: null, number: 'INV-1', description: null,
    amount: 50000, currency: 'INR', status: 'pending', issued_at: iso(-40), due_at: iso(-10), paid_at: null,
  });
  // due soon
  await table<Invoice>('invoices').insert({
    id: 'i_soon', project_id: 'p_client', quote_id: null, number: 'INV-2', description: null,
    amount: 20000, currency: 'INR', status: 'pending', issued_at: iso(-5), due_at: iso(3), paid_at: null,
  });
  // paid — must NOT alert
  await table<Invoice>('invoices').insert({
    id: 'i_paid', project_id: 'p_client', quote_id: null, number: 'INV-3', description: null,
    amount: 10000, currency: 'INR', status: 'paid', issued_at: iso(-30), due_at: iso(-20), paid_at: iso(-22),
  });
  // bounty deadline 2 days out
  await table<BountySubmission>('bounty_submissions').insert({
    id: 's_1', project_id: 'p_bounty', program: 'Acme · H1', severity: 'critical',
    status: 'triaged', payout: null, currency: 'INR', disclosure_deadline: iso(2),
  });
  // duplicate submission — must NOT alert
  await table<BountySubmission>('bounty_submissions').insert({
    id: 's_dup', project_id: 'p_bounty', program: 'Acme · H1', severity: 'low',
    status: 'duplicate', payout: 0, currency: 'INR', disclosure_deadline: iso(1),
  });
  // backed-up brain dump
  for (let i = 0; i < 9; i++) {
    await table<Task>('tasks').insert({
      id: `t_${i}`, owner_id: OWNER, project_id: null, title: `task ${i}`,
      scheduled_date: null, scheduled_hour: null, done: false, created_at: new Date().toISOString(),
    });
  }

  const alerts = await getAlerts(OWNER);
  const ids = alerts.map((a) => a.id);
  console.log('   alerts:', ids.join(', '));

  assert(ids.includes('inv-overdue-i_over'), 'overdue invoice raises a critical alert');
  assert(ids.includes('inv-due-i_soon'), 'invoice due in 3d raises a warning');
  assert(!ids.some((i) => i.includes('i_paid')), 'paid invoice raises NO alert');
  assert(ids.includes('bounty-s_1'), 'bounty disclosure deadline raises an alert');
  assert(!ids.some((i) => i.includes('s_dup')), 'duplicate submission raises NO alert');
  assert(ids.includes('risk-p_risk'), 'at-risk project raises an alert');
  assert(ids.includes('stale-p_old'), '90-day-old active project raises a stale alert');
  assert(!ids.includes('stale-p_client'), 'fresh project does NOT raise a stale alert');
  assert(ids.includes('braindump-backlog'), '9 unscheduled tasks raises the backlog nudge');
  assert(alerts[0]?.level === 'critical', `critical alerts sort first (got "${alerts[0]?.level}")`);

  const other = await getAlerts('someone-else@example.com');
  assert(other.length === 0, 'alerts are scoped to the owner (other user sees none)');

  writeDb({ clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
    bounty_submissions: [], project_metrics: [], milestones: [], notes: [], tasks: [], integrations: [], alert_states: [] });
  console.log('\nReset data/db.local.json back to empty.');
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
