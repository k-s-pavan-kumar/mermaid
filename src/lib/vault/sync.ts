import fs from 'fs';
import path from 'path';
import { vaultAvailable } from './local-vault';

const VAULT_PATH = path.join(process.cwd(), 'vault');

export interface ScannedNote {
  vaultPath: string;   // relative, forward-slashed
  title: string;
  tags: string[];
  body: string;
  mtime: string;       // file's last-modified time, ISO
}

function parseFrontmatter(raw: string): { title?: string; tags: string[]; body: string } {
  if (!raw.startsWith('---')) return { tags: [], body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { tags: [], body: raw };

  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4).replace(/^\n/, '');

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  const tagsMatch = fm.match(/^tags:\s*\[(.*)\]$/m);

  return {
    title: titleMatch?.[1]?.trim(),
    tags: tagsMatch?.[1]?.split(',').map((t) => t.trim()).filter(Boolean) ?? [],
    body,
  };
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip Obsidian's own config/workspace directory.
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/**
 * Read every .md file currently in the vault. This is the half of sync that
 * protects against data loss: notes created or edited directly in Obsidian
 * (the common case — you're in Obsidian, you jot something) exist only on
 * disk until this reconciles them back into Meridian's index.
 */
export function scanVault(): ScannedNote[] {
  if (!vaultAvailable()) return [];
  const files = walk(VAULT_PATH);
  return files.map((full) => {
    const raw = fs.readFileSync(full, 'utf-8');
    const { title, tags, body } = parseFrontmatter(raw);
    const rel = path.relative(VAULT_PATH, full).split(path.sep).join('/');
    return {
      vaultPath: rel,
      title: title ?? path.basename(full, '.md'),
      tags,
      body,
      mtime: fs.statSync(full).mtime.toISOString(),
    };
  });
}

export function vaultFileExists(vaultPath: string): boolean {
  // Without a disk there is nothing to be "missing from" — don't flag every note.
  if (!vaultAvailable()) return true;
  return fs.existsSync(path.join(VAULT_PATH, vaultPath));
}

export function vaultRoot(): string {
  return VAULT_PATH;
}
