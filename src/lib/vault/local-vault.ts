import fs from 'fs';
import path from 'path';

// Writes real .md files to a local "vault" folder at the project root.
// Point Obsidian at this folder (File > Open Vault) and its graph view
// will render the [[wikilinks]] below automatically — Meridian never
// draws the graph itself, per the original design.
const VAULT_PATH = path.join(process.cwd(), 'vault');

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
  const folderPath = path.join(VAULT_PATH, input.folder);
  fs.mkdirSync(folderPath, { recursive: true });

  const fileName = `${slugify(input.title)}.md`;
  const relativePath = path.join(input.folder, fileName);
  const fullPath = path.join(VAULT_PATH, relativePath);

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

  fs.writeFileSync(fullPath, frontmatter + input.content + linksBlock);

  // Return a path using forward slashes regardless of OS, since that's
  // what gets stored in the notes table and what Obsidian expects.
  return relativePath.split(path.sep).join('/');
}

export function deleteVaultNote(vaultPath: string): void {
  const fullPath = path.join(VAULT_PATH, vaultPath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export function readVaultNote(vaultPath: string): string | null {
  const fullPath = path.join(VAULT_PATH, vaultPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}
