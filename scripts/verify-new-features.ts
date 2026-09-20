/**
 * Verifies the trickiest new logic across the five features added in this
 * pass, at the query/logic layer — same convention as the rest of this
 * verify suite: `'use server'` actions call getSessionEmail(), which reads
 * next/headers' cookies() and throws outside a real request, so this script
 * (like every other verify-*.ts here) drives the underlying query and pure
 * functions directly with an explicit ownerId instead of going through the
 * action boundary.
 *
 *   1. Reward Vault state machine — unlock, cooldown, ready, expiry, and a
 *      dropped project releasing its need.
 *   2. Spend-cap basis and one-active-need occupancy detection.
 *   3. Daily Finance auto-posting is idempotent per source event.
 *   4. Bug Bounty payout figures mean the right thing at each column.
 *   5. Learning Tracker status/progress derive from lesson counts, never
 *      drift independently.
 *
 * Run with: npx tsx scripts/verify-new-features.ts
 */
import { writeDb, type LocalDB } from '../src/lib/data/local-store';
import { table } from '../src/lib/data';
import type { Project } from '../src/features/projects/types';
import type { Invoice } from '../src/features/billing/types';
import type { Need } from '../src/features/reward-vault/types';
import type { Course } from '../src/features/learning-tracker/types';
import type { BountyCase } from '../src/features/bounty-pipeline/types';
import type { FinanceEntry } from '../src/features/daily-finance/types';

import { reconcileNeeds, occupiedSourceIds } from '../src/features/reward-vault/queries';
import { getSourceSnapshot, getLinkableProjects } from '../src/features/reward-vault/source';
import { courseStatus, courseProgressPct } from '../src/features/learning-tracker/types';
import { activePayout } from '../src/features/bounty-pipeline/types';
import { insertIncomeEntry, insertRewardVaultExpense } from '../src/features/daily-finance/queries';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

const OWNER = 'verify@meridian.test';
const TODAY = new Date().toISOString().slice(0, 10);

function emptyDb(): LocalDB {
  return {
    clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
    bounty_submissions: [], project_metrics: [], milestones: [], notes: [],
    tasks: [], integrations: [], alert_states: [], meetings: [], settings: [],
    focus_sessions: [], targets_history: [],
    finance_entries: [], bounty_cases: [], needs: [], courses: [],
    tracked_packages: [], metric_snapshots: [], project_status_log: [],
  };
}

function project(over: Partial<Project>): Project {
  return {
    id: 'proj_1', owner_id: OWNER, name: 'Acme redesign', type: 'client', types: ['client'],
    client_id: null, status: 'ontrack', description: null, created_at: `${TODAY}T00:00:00.000Z`,
    ...over,
  };
}
function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: 'inv_1', owner_id: OWNER, project_id: 'proj_1', client_id: null, quote_id: null,
    stream: 'freelance', number: 'INV-1', description: null, items: [], amount: 20000,
    tax_pct: 0, currency: 'INR', notes: null, status: 'paid',
    issued_at: TODAY, due_at: null, paid_at: TODAY, ...over,
  };
}
function need(over: Partial<Need>): Need {
  return {
    id: 'need_1', owner_id: OWNER, name: 'Standing desk', category: 'Desk setup',
    emoji_icon: '🎁', price: 9000, source_type: 'project', linked_source_id: 'proj_1',
    status: 'in_progress', progress_pct: 0,
    unlocked_at: null, cooldown_ends_at: null, purchased_at: null, expires_at: null,
    created_at: `${TODAY}T00:00:00.000Z`, linked_at: `${TODAY}T00:00:00.000Z`, notify_pending: null,
    ...over,
  };
}

async function main() {
  console.log('\n1. Reward Vault: full state machine, day by day');
  {
    writeDb({ ...emptyDb(), projects: [project({ status: 'ontrack' })], invoices: [invoice({})], needs: [need({})] });

    let [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'in_progress', 'a fresh need linked to an unfinished project stays in_progress');
    eq(n?.notify_pending, null, 'no notification is queued while still locked in');

    // Project becomes done + the linked invoice is already paid.
    await table<Project>('projects').update('proj_1', { status: 'done' });
    [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'cooling_off', 'done + paid together starts the cooldown, never a direct purchase');
    assert(!!n?.unlocked_at, 'unlocked_at is stamped the moment the cooldown starts');
    eq(n?.notify_pending, 'cooldown_started', 'a cooldown-started notification is queued exactly once');

    // Cooldown hasn't elapsed — reconciling again doesn't jump ahead.
    [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'cooling_off', 'reconciling before the cooldown ends does not advance the state early');

    // Force the cooldown to have already elapsed.
    await table<Need>('needs').update(n!.id, { cooldown_ends_at: new Date(Date.now() - 1000).toISOString() });
    [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'ready', 'once the cooldown has elapsed, reconciliation alone makes it ready — no purchase needed');
    assert(!!n?.expires_at, 'an expiry deadline is set the moment it becomes ready');
    eq(n?.notify_pending, 'ready', 'a ready notification is queued exactly once');

    // Purchase — only the dedicated write, never inferred by reconciliation.
    await table<Need>('needs').update(n!.id, { status: 'purchased', purchased_at: TODAY });
    [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'purchased', 'purchased is a terminal state reconciliation never overrides');
  }

  console.log('\n2. Reward Vault: expiry and a dropped project releasing its need');
  {
    writeDb({
      ...emptyDb(),
      projects: [project({ id: 'proj_2', status: 'ontrack' })],
      needs: [need({ id: 'need_ready', linked_source_id: 'proj_2', status: 'ready', unlocked_at: TODAY, expires_at: new Date(Date.now() - 1000).toISOString() })],
    });
    let [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'expired', 'sitting unpurchased past expires_at auto-expires the need');
    eq(n?.linked_source_id, null, 'expiry clears the link, same as a release');
    eq(n?.notify_pending, null, 'expiry itself does not queue a toast — only unlocking does');

    writeDb({
      ...emptyDb(),
      projects: [project({ id: 'proj_3', status: 'ontrack' })],
      needs: [need({ id: 'need_dropped', linked_source_id: 'proj_3', status: 'in_progress', progress_pct: 60 })],
    });
    await table<Project>('projects').update('proj_3', { status: 'dropped' });
    [n] = await reconcileNeeds(OWNER, 48, 14);
    eq(n?.status, 'released', 'a dropped project immediately releases its in_progress need, regardless of progress');
    eq(n?.linked_source_id, null, 'release clears the link so it can be relinked elsewhere');
    eq(n?.progress_pct, 60, 'progress freezes at its last value rather than resetting to 0');
  }

  console.log('\n3. Reward Vault: spend-cap basis and one-active-need occupancy');
  {
    writeDb({
      ...emptyDb(),
      projects: [project({ id: 'proj_4', status: 'ontrack' }), project({ id: 'proj_5', status: 'done' }), project({ id: 'proj_6', status: 'dropped' })],
      invoices: [invoice({ id: 'inv_4', project_id: 'proj_4', amount: 10000 })],
      needs: [need({ id: 'occupying', linked_source_id: 'proj_4', status: 'in_progress' })],
    });

    const snap4 = await getSourceSnapshot('project', 'proj_4');
    eq(snap4?.capBasis, 10000, "a project's cap basis is its paid invoice amount");
    assert(snap4?.isActive === true, 'an ontrack project is active — a new need could link to it (if unoccupied)');

    const snap5 = await getSourceSnapshot('project', 'proj_5');
    assert(snap5?.isActive === false, 'a done project is not active — rule 8, no backdating onto finished work');

    const snap6 = await getSourceSnapshot('project', 'proj_6');
    assert(snap6?.isActive === false, 'a dropped project is not active either');

    const needs = await table<Need>('needs').where((n) => n.owner_id === OWNER);
    const occupied = occupiedSourceIds(needs, 'project');
    assert(occupied.has('proj_4'), 'a project with an active (in_progress) need is correctly detected as occupied');

    const linkable = await getLinkableProjects(OWNER, occupied);
    const four = linkable.find((p) => p.id === 'proj_4');
    eq(four?.occupiedBy, 'proj_4', 'the linkable-projects list flags the occupied one');
    assert(!linkable.some((p) => p.id === 'proj_5'), 'a done project does not appear as a linkable option at all');
    assert(!linkable.some((p) => p.id === 'proj_6'), 'a dropped project does not appear as a linkable option either');
  }

  console.log('\n4. Bug Bounty Pipeline: payout meaning changes per column');
  {
    const submitted: BountyCase = {
      id: 'bc_1', owner_id: OWNER, title: 'IDOR', program_name: 'H1 — Acme', severity: 'high',
      status: 'submitted', currency: 'INR', estimated_payout: 15000, confirmed_payout: null, paid_amount: null,
      submitted_at: TODAY, triaged_at: null, accepted_at: null, paid_at: null, created_at: `${TODAY}T00:00:00.000Z`,
    };
    eq(activePayout(submitted), { amount: 15000, kind: 'estimate' }, 'submitted shows the estimate');

    const triaged: BountyCase = { ...submitted, status: 'triaged', triaged_at: TODAY };
    eq(activePayout(triaged), { amount: 15000, kind: 'estimate' }, 'triaged still shows the estimate, not a confirmed number');

    const accepted: BountyCase = { ...triaged, status: 'accepted', accepted_at: TODAY, confirmed_payout: 18000 };
    eq(activePayout(accepted), { amount: 18000, kind: 'confirmed' }, 'accepted shows the program-confirmed figure, not the original guess');

    const paid: BountyCase = { ...accepted, status: 'paid', paid_at: TODAY, paid_amount: 17500 };
    eq(activePayout(paid), { amount: 17500, kind: 'paid' }, 'paid shows the real final figure, which can differ from what was confirmed');
  }

  console.log('\n5. Daily Finance: auto-posting is idempotent per source event');
  {
    writeDb(emptyDb());
    await insertIncomeEntry({
      ownerId: OWNER, date: TODAY, category: 'Client payment', amount: 5000, note: null,
      source: 'invoice_payment', linkedInvoiceId: 'inv_dup',
    });
    await insertIncomeEntry({
      ownerId: OWNER, date: TODAY, category: 'Client payment', amount: 5000, note: null,
      source: 'invoice_payment', linkedInvoiceId: 'inv_dup',
    });
    const dup = await table<FinanceEntry>('finance_entries').where((e) => e.linked_invoice_id === 'inv_dup');
    eq(dup.length, 1, 'posting the same invoice-payment event twice creates only one income entry, not two');

    await insertRewardVaultExpense({ ownerId: OWNER, date: TODAY, amount: 8000, note: 'Standing desk', linkedNeedId: 'need_dup' });
    await insertRewardVaultExpense({ ownerId: OWNER, date: TODAY, amount: 8000, note: 'Standing desk', linkedNeedId: 'need_dup' });
    const dupExpense = await table<FinanceEntry>('finance_entries').where((e) => e.linked_need_id === 'need_dup');
    eq(dupExpense.length, 1, 'the same Reward Vault purchase event is also posted only once');
    eq(dupExpense[0]?.category, 'Wishlist purchase', "...categorised as 'Wishlist purchase'");
    eq(dupExpense[0]?.type, 'expense', '...as an expense, not income');
  }

  console.log('\n6. Learning Tracker: status and progress derive from lesson counts, never drift');
  {
    const fresh: Pick<Course, 'completed_lessons' | 'total_lessons'> = { completed_lessons: 0, total_lessons: 10 };
    eq(courseStatus(fresh), 'not_started', 'zero completed lessons reads as not_started');
    eq(courseProgressPct(fresh), 0, '...at 0%');

    const partial = { completed_lessons: 4, total_lessons: 10 };
    eq(courseStatus(partial), 'in_progress', 'a partial lesson count reads as in_progress');
    eq(courseProgressPct(partial), 40, '...at the right percentage');

    const done = { completed_lessons: 10, total_lessons: 10 };
    eq(courseStatus(done), 'completed', 'reaching the full lesson count reads as completed');
    eq(courseProgressPct(done), 100, '...at 100%');

    const overshoot = { completed_lessons: 12, total_lessons: 10 };
    eq(courseStatus(overshoot), 'completed', 'a count above the total still reads as completed, not an error');
    eq(courseProgressPct(overshoot), 100, '...and progress caps at 100%, never exceeds it');

    const backTrack = { completed_lessons: 8, total_lessons: 10 };
    eq(courseStatus(backTrack), 'in_progress', 'dropping below the full count after completion reverts status to in_progress — status always follows the counts, never sticks');
  }

  writeDb(emptyDb());
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
}

main().then(() => { if (failures > 0) process.exit(1); });
