import { table } from '../src/lib/data/local-store';
import { writeDb } from '../src/lib/data/local-store';
import type { Client } from '../src/features/clients/types';
import type {
  Project,
  ProjectPhase,
  Quote,
  Invoice,
  BountySubmission,
  Milestone,
} from '../src/features/projects/types';
import { getProjectById, getEarningsSummary } from '../src/features/projects/queries';
import { getClients } from '../src/features/clients/queries';

const OWNER = 'test@example.com';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

async function main() {
  // --- Client CRUD ---------------------------------------------------------
  const client = await table<Client>('clients').insert({
    id: 'client_test_marcus',
    owner_id: OWNER,
    name: 'Marcus Webb',
    company: 'Zooli',
    email: 'marcus@zooli.example',
    timezone: 'America/New_York',
    notes: null,
    created_at: new Date().toISOString(),
  });
  const clients = await getClients(OWNER);
  assert(clients.some((c) => c.id === client.id), 'client insert is readable via getClients()');

  // --- Project + sub-resources ----------------------------------------------
  const project = await table<Project>('projects').insert({
    id: 'proj_test_zooli',
    owner_id: OWNER,
    name: 'Zooli',
    type: 'client',
    client_id: client.id,
    status: 'ontrack',
    description: 'test project',
    created_at: new Date().toISOString(),
  });

  await table<ProjectPhase>('project_phases').insert({
    id: 'phase_test_1',
    project_id: project.id,
    label: 'Design system',
    color: '#1F5C4E',
    sort_order: 0,
    width_pct: 40,
  });

  await table<Quote>('quotes').insert({
    id: 'quote_test_1',
    project_id: project.id,
    number: 'Q-TEST-1',
    description: 'test quote',
    amount: 100000,
    currency: 'INR',
    status: 'accepted',
    issued_at: '2026-09-01',
  });

  await table<Invoice>('invoices').insert({
    id: 'inv_test_1',
    project_id: project.id,
    quote_id: 'quote_test_1',
    number: 'INV-TEST-1',
    description: 'milestone 1',
    amount: 50000,
    currency: 'INR',
    status: 'paid',
    issued_at: '2026-09-05',
    due_at: '2026-09-19',
    paid_at: '2026-09-10',
  });

  await table<Invoice>('invoices').insert({
    id: 'inv_test_2',
    project_id: project.id,
    quote_id: 'quote_test_1',
    number: 'INV-TEST-2',
    description: 'milestone 2',
    amount: 50000,
    currency: 'INR',
    status: 'pending',
    issued_at: '2026-09-12',
    due_at: '2026-09-26',
    paid_at: null,
  });

  await table<Milestone>('milestones').insert({
    id: 'ms_test_1',
    project_id: project.id,
    label: 'Kickoff complete',
    occurred_on: '2026-09-01',
  });

  // --- Bug bounty project ----------------------------------------------------
  const bountyProject = await table<Project>('projects').insert({
    id: 'proj_test_bounty',
    owner_id: OWNER,
    name: 'Bug Bounty — Test Corp',
    type: 'bounty',
    client_id: null,
    status: 'review',
    description: null,
    created_at: new Date().toISOString(),
  });

  await table<BountySubmission>('bounty_submissions').insert({
    id: 'sub_test_1',
    project_id: bountyProject.id,
    program: 'Test Corp · HackerOne',
    severity: 'high',
    status: 'accepted',
    payout: 42000,
    currency: 'INR',
    disclosure_deadline: null,
  });

  // --- Assertions on the joined detail view ----------------------------------
  const detail = await getProjectById(project.id);
  assert(!!detail, 'getProjectById returns the project');
  assert(detail?.phases.length === 1, 'project has 1 phase');
  assert(detail?.quotes.length === 1, 'project has 1 quote');
  assert(detail?.invoices.length === 2, 'project has 2 invoices');
  assert(detail?.milestones.length === 1, 'project has 1 milestone');

  // --- Earnings math -----------------------------------------------------
  const earnings = await getEarningsSummary();
  assert(earnings.invoiced === 100000, `invoiced totals 100000 (got ${earnings.invoiced})`);
  assert(earnings.paid === 50000 + 42000, `paid totals 92000 incl. bounty (got ${earnings.paid})`);
  assert(earnings.outstanding === 50000, `outstanding totals 50000 (got ${earnings.outstanding})`);
  assert(earnings.bountyPaid === 42000, `bounty payouts total 42000 (got ${earnings.bountyPaid})`);

  // --- Cascade delete (same logic as deleteProject action) -------------------
  for (const t of ['project_phases', 'quotes', 'invoices', 'bounty_submissions', 'project_metrics', 'milestones'] as const) {
    const rows = await table<{ id: string; project_id: string }>(t).where((r) => r.project_id === project.id);
    for (const row of rows) await table<{ id: string }>(t).remove(row.id);
  }
  await table<Project>('projects').remove(project.id);

  const afterDelete = await getProjectById(project.id);
  assert(afterDelete === undefined, 'project no longer found after delete');
  assert((await table<Quote>('quotes').all()).length === 0, 'orphaned quotes were cascade-deleted');
  assert((await table<Invoice>('invoices').all()).length === 0, 'orphaned invoices were cascade-deleted');
  assert((await table<Milestone>('milestones').all()).length === 0, 'orphaned milestones were cascade-deleted');

  // --- Reset the DB back to empty so this script leaves no trace -------------
  writeDb({
    clients: [],
    projects: [],
    project_phases: [],
    quotes: [],
    invoices: [],
    bounty_submissions: [],
    project_metrics: [],
    milestones: [],
    notes: [],
    tasks: [],
    integrations: [],
    alert_states: [],
  });
  console.log('\nReset data/db.local.json back to empty.');

  if (process.exitCode) {
    console.error('\nSome checks FAILED — see above.');
  } else {
    console.log('\nAll checks passed.');
  }
}

main();
