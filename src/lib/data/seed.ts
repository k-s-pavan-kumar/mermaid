import { writeDb, type LocalDB } from './local-store';

// Run with: npm run db:seed:local
// Resets data/db.local.json to a clean, empty database — every collection
// exists (so the app boots and types check) but starts with no rows. Add
// your real clients/projects/tasks through the app itself once you're
// logged in; there's no fixture data to clear out anymore.

const db: LocalDB = {
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
  meetings: [],
  settings: [],
  focus_sessions: [],
};

writeDb(db);
console.log('✓ Reset local dev database at data/db.local.json (empty — no fixtures)');
