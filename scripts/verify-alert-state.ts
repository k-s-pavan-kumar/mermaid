import { table, writeDb } from '../src/lib/data/local-store';
import { getAlerts, getHiddenAlerts } from '../src/features/notifications/queries';
import type { AlertState } from '../src/features/notifications/types';
import type { Project } from '../src/features/projects/types';

const OWNER = 'test@example.com';
function assert(c: unknown, m: string) {
  if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m);
}
const empty = { clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
  bounty_submissions: [], project_metrics: [], milestones: [], notes: [], tasks: [],
  integrations: [], alert_states: [] };

async function main() {
  await table<Project>('projects').insert({
    id: 'p_risk', owner_id: OWNER, name: 'Wobbly', type: 'internal',
    client_id: null, status: 'risk', description: null, created_at: new Date().toISOString(),
  });

  let alerts = await getAlerts(OWNER);
  assert(alerts.length === 1, `one alert derived (got ${alerts.length})`);
  assert(alerts[0]!.read === false, 'alert starts unread');
  const key = alerts[0]!.id;

  // mark read
  await table<AlertState>('alert_states').insert({
    id: `${OWNER}:${key}`, owner_id: OWNER, alert_key: key,
    read: true, dismissed: false, snoozed_until: null, updated_at: new Date().toISOString(),
  });
  alerts = await getAlerts(OWNER);
  assert(alerts[0]!.read === true, 'read state persists and merges onto the derived alert');
  assert(alerts.length === 1, 'a read alert is still visible');

  // dismiss
  await table<AlertState>('alert_states').update(`${OWNER}:${key}`, { dismissed: true });
  alerts = await getAlerts(OWNER);
  assert(alerts.length === 0, 'dismissed alert is filtered out of the active list');
  let hidden = await getHiddenAlerts(OWNER);
  assert(hidden.length === 1, 'dismissed alert appears in the hidden list');

  // restore, then snooze into the future
  await table<AlertState>('alert_states').update(`${OWNER}:${key}`, {
    dismissed: false, snoozed_until: new Date(Date.now() + 3 * 86400000).toISOString(),
  });
  alerts = await getAlerts(OWNER);
  assert(alerts.length === 0, 'future-snoozed alert is hidden');
  hidden = await getHiddenAlerts(OWNER);
  assert(hidden.length === 1, 'snoozed alert appears in the hidden list');

  // snooze that has expired should come BACK
  await table<AlertState>('alert_states').update(`${OWNER}:${key}`, {
    snoozed_until: new Date(Date.now() - 86400000).toISOString(),
  });
  alerts = await getAlerts(OWNER);
  assert(alerts.length === 1, 'expired snooze returns the alert to the active list');

  // scoping
  const other = await getAlerts('nobody@example.com');
  assert(other.length === 0, 'alert state is scoped per owner');

  writeDb(empty);
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
