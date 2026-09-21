import fs from 'fs';
import path from 'path';

// Writes real .md files to a local "vault" folder at the project root.
// Point Obsidian at this folder (File > Open Vault) and its graph view
// will render the [[wikilinks]] below automatically — Meridian never
// draws the graph itself, per the original design.
const VAULT_PATH = path.join(process.cwd(), 'vault');

/**
 * Serverless hosts (Vercel, Netlify, Lambda) have a read-only or ephemeral
 * filesystem, so the on-disk Obsidian vault only exists when running locally
 * or on a VPS. There the note body lives in the database (notes.content) and
 * every vault function below quietly does nothing instead of throwing.
 */
export function vaultAvailable(): boolean {
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.NETLIFY;
}

export function slugify(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');
}

export interface VaultNoteInput {
  title: string;
  folder: string; // e.g. 'Projects', 'Clients', 'SOPs'
  tags: string[];
  content: string;
  links?: string[]; // note titles to wikilink, e.g. ['Zooli', 'Marcus Webb']
}

export function writeVaultNote(input: VaultNoteInput): string {
  const fileName = `${slugify(input.title)}.md`;
  const relativePath = path.join(input.folder, fileName);
  const fullPath = path.join(VAULT_PATH, relativePath);
  const storedPath = relativePath.split(path.sep).join('/');

  // No writable disk: the caller still gets the logical path and keeps the
  // body in the database.
  if (!vaultAvailable()) return storedPath;

  const frontmatter = [
    '---',
    `title: ${input.title}`,
    `tags: [${input.tags.join(', ')}]`,
    `updated: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');

  const linksBlock =
    input.links && input.links.length > 0
      ? `\n\nLinked: ${input.links.map((l) => `[[${l}]]`).join(' · ')}\n`
      : '';

  try {
    fs.mkdirSync(path.join(VAULT_PATH, input.folder), { recursive: true });
    fs.writeFileSync(fullPath, frontmatter + input.content + linksBlock);
  } catch (err) {
    // A failed mirror must never lose the note — the body is saved in the DB.
    console.error('[vault] could not write', storedPath, err);
  }

  // Forward slashes regardless of OS: that's what gets stored in the notes
  // table and what Obsidian expects.
  return storedPath;
}

export function deleteVaultNote(vaultPath: string): void {
  if (!vaultAvailable()) return;
  const fullPath = path.join(VAULT_PATH, vaultPath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export function readVaultNote(vaultPath: string): string | null {
  if (!vaultAvailable()) return null;
  const fullPath = path.join(VAULT_PATH, vaultPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}
