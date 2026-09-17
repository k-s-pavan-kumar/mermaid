import fs from 'fs';
import path from 'path';
import { writeVaultNote, readVaultNote, deleteVaultNote } from '../src/lib/vault/local-vault';
import { table, writeDb } from '../src/lib/data/local-store';
import { PROVIDERS } from '../src/features/integrations/registry';
import type { Integration } from '../src/features/integrations/types';
import type { ProjectMetric } from '../src/features/projects/types';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

async function main() {
  // --- Vault note writing ---------------------------------------------
  const vaultPath = writeVaultNote({
    title: 'Test SOP Note',
    folder: 'SOPs',
    tags: ['sop', 'test'],
    content: 'This is a test note body.',
    links: ['Zooli'],
  });
  assert(vaultPath === 'SOPs/Test SOP Note.md', `vault_path is correct (got "${vaultPath}")`);

  const fullPath = path.join(process.cwd(), 'vault', vaultPath);
  assert(fs.existsSync(fullPath), 'the .md file actually exists on disk');

  const raw = readVaultNote(vaultPath);
  assert(!!raw, 'readVaultNote returns content');
  assert(raw!.includes('title: Test SOP Note'), 'frontmatter has the title');
  assert(raw!.includes('tags: [sop, test]'), 'frontmatter has the tags');
  assert(raw!.includes('This is a test note body.'), 'body content is present');
  assert(raw!.includes('[[Zooli]]'), 'wikilink to the project is present — this is what Obsidian graphs');

  deleteVaultNote(vaultPath);
  assert(!fs.existsSync(fullPath), 'file removed after deleteVaultNote');

  // Clean up the (now-empty) vault dir this test created
  const vaultRoot = path.join(process.cwd(), 'vault');
  if (fs.existsSync(vaultRoot)) {
    fs.rmSync(vaultRoot, { recursive: true, force: true });
  }

  // --- Integrations pipeline (provider -> project_metrics) -------------
  const OWNER = 'test@example.com';
  const project_id = 'proj_test_integrations';

  const integration = await table<Integration>('integrations').insert({
    id: 'int_test_1',
    owner_id: OWNER,
    project_id,
    provider: 'pypi',
    config: { package: 'archivehunter' },
    last_synced_at: null,
  });

  let results: Awaited<ReturnType<typeof PROVIDERS.pypi>>;
  try {
    results = await PROVIDERS[integration.provider](integration.config);
  } catch (err) {
    assert(false, `PyPI provider fetch succeeded (got error: ${(err as Error).message})`);
    results = [];
  }
  assert(results.length > 0, `PyPI provider returned metrics (got ${results.length})`);

  for (const r of results) {
    await table<ProjectMetric>('project_metrics').insert({
      id: `metric_test_${Math.random().toString(36).slice(2, 8)}`,
      project_id,
      source: integration.provider,
      label: r.label,
      value: r.value,
      delta: r.delta,
      captured_at: new Date().toISOString(),
    });
  }

  const stored = await table<ProjectMetric>('project_metrics').where((m) => m.project_id === project_id);
  assert(stored.length === results.length, `fetched metrics were persisted to project_metrics (${stored.length} rows)`);
  assert(
    stored.some((m) => m.label === 'Latest version' && m.value.match(/^\d+\.\d+\.\d+$/)),
    `a real version number was captured (e.g. "${stored.find((m) => m.label === 'Latest version')?.value}")`
  );

  // --- Reset the DB back to empty so this script leaves no trace -------
  writeDb({
    clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
    bounty_submissions: [], project_metrics: [], milestones: [], notes: [],
    tasks: [], integrations: [], alert_states: [],
  });
  console.log('\nReset data/db.local.json back to empty.');

  if (process.exitCode) {
    console.error('\nSome checks FAILED — see above.');
  } else {
    console.log('\nAll checks passed.');
  }
}

main();
