import fs from 'fs';
import path from 'path';
import { writeVaultNote } from '../src/lib/vault/local-vault';
import { scanVault, vaultFileExists, vaultRoot } from '../src/lib/vault/sync';
import { writeDb } from '../src/lib/data/local-store';

function assert(c: unknown, m: string) {
  if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m);
}
const empty = { clients: [], projects: [], project_phases: [], quotes: [], invoices: [],
  bounty_submissions: [], project_metrics: [], milestones: [], notes: [], tasks: [],
  integrations: [], alert_states: [] };

async function main() {
  // 1. A note written by Meridian is readable back by the scanner.
  writeVaultNote({ title: 'Written By App', folder: 'SOPs', tags: ['sop','x'], content: 'App body.', links: ['Zooli'] });

  // 2. Simulate a note created directly in Obsidian — file only, no DB row.
  const obsDir = path.join(vaultRoot(), 'Projects');
  fs.mkdirSync(obsDir, { recursive: true });
  fs.writeFileSync(path.join(obsDir, 'Made In Obsidian.md'),
    '---\ntitle: Made In Obsidian\ntags: [field, notes]\n---\n\nTyped straight into Obsidian.\n');

  // 3. A bare file with no frontmatter at all (very common in real vaults).
  fs.writeFileSync(path.join(obsDir, 'Bare Note.md'), 'Just text, no frontmatter.\n');

  // 4. An Obsidian config dir that must be ignored.
  const cfg = path.join(vaultRoot(), '.obsidian');
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, 'workspace.md'), 'should be ignored');

  const scanned = scanVault();
  const titles = scanned.map((s) => s.title).sort();
  console.log('   scanned:', titles.join(', '));

  assert(titles.includes('Written By App'), 'scanner finds a note Meridian wrote');
  assert(titles.includes('Made In Obsidian'), 'scanner finds a note created only in Obsidian (the data-loss case)');
  assert(titles.includes('Bare Note'), 'scanner handles a file with no frontmatter, falling back to filename');
  assert(!titles.includes('workspace'), '.obsidian config dir is ignored');

  const obs = scanned.find((s) => s.title === 'Made In Obsidian')!;
  assert(obs.tags.join(',') === 'field,notes', `frontmatter tags parsed (got "${obs.tags.join(',')}")`);
  assert(obs.body.includes('Typed straight into Obsidian'), 'body parsed separately from frontmatter');
  assert(obs.vaultPath === 'Projects/Made In Obsidian.md', `vaultPath is relative + forward-slashed (got "${obs.vaultPath}")`);

  const bare = scanned.find((s) => s.title === 'Bare Note')!;
  assert(bare.tags.length === 0, 'no-frontmatter file yields empty tags rather than crashing');
  assert(bare.body.includes('Just text'), 'no-frontmatter file keeps its whole body');

  assert(vaultFileExists('Projects/Made In Obsidian.md'), 'vaultFileExists finds a real file');
  assert(!vaultFileExists('Projects/Nope.md'), 'vaultFileExists is false for a missing file');

  fs.rmSync(vaultRoot(), { recursive: true, force: true });
  writeDb(empty);
  console.log(process.exitCode ? '\nSome checks FAILED.' : '\nAll checks passed.');
}
main();
