import { WORK_TYPE_COLOR, WORK_TYPE_LABEL, type WorkType } from './types';

// "Type of work" tags. Nine are built in (stored as keys like 'web'); anything
// else a user adds is a *custom* tag, stored as its own text ("SEO",
// "Photography"). Both live in the same clients.work_types array.
//
// Pure — no I/O — so the server actions, the picker and the verify script all
// share exactly the same rules.

export const MAX_TAG_LENGTH = 30;
export const MAX_TAGS_PER_CLIENT = 20;

const CUSTOM_PALETTE = [
  'var(--cyan)', 'var(--gold)', 'var(--plumrose)', 'var(--slate)',
  'var(--sage)', 'var(--pine)', 'var(--rust)', 'var(--violet)',
];

export function isBuiltInWorkType(t: string): t is WorkType {
  return Object.prototype.hasOwnProperty.call(WORK_TYPE_LABEL, t);
}

/** Tidy what someone typed: no control characters, collapsed spaces, capped length. */
export function cleanTagText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ') // control chars, and angle brackets nobody needs in a tag
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

export function workTypeLabel(t: string): string {
  return isBuiltInWorkType(t) ? WORK_TYPE_LABEL[t] : t;
}

/** Built-ins keep their colours; a custom tag gets a stable one derived from its text,
 *  so "SEO" is the same colour on every client and every reload. */
export function workTypeColor(t: string): string {
  if (isBuiltInWorkType(t)) return WORK_TYPE_COLOR[t];
  let h = 5381;
  for (const ch of t.toLowerCase()) h = ((h << 5) + h + ch.codePointAt(0)!) | 0;
  return CUSTOM_PALETTE[Math.abs(h) % CUSTOM_PALETTE.length]!;
}

const BUILT_IN_BY_LABEL = new Map<string, WorkType>(
  (Object.keys(WORK_TYPE_LABEL) as WorkType[]).flatMap((k) => [[k.toLowerCase(), k], [WORK_TYPE_LABEL[k].toLowerCase(), k]] as [string, WorkType][]),
);

/**
 * Anything submitted (form fields, assistant tool args) → a clean, de-duplicated list.
 *  - built-in keys pass through; typing a built-in's name ("web development") maps to it,
 *    so there is never a custom twin of a built-in;
 *  - a custom tag matching one you already use (any capitalisation) reuses that spelling,
 *    so "seo" doesn't become a second tag next to "SEO";
 *  - duplicates, blanks and non-strings are dropped; at most MAX_TAGS_PER_CLIENT kept.
 */
export function normalizeWorkTypes(raw: unknown[], library: string[] = []): string[] {
  const known = new Map<string, string>(); // lower-case → preferred spelling
  for (const l of library) { const c = cleanTagText(l); if (c && !known.has(c.toLowerCase())) known.set(c.toLowerCase(), c); }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = cleanTagText(item);
    if (!text) continue;
    const lower = text.toLowerCase();
    const tag = BUILT_IN_BY_LABEL.get(lower) ?? known.get(lower) ?? text;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_CLIENT) break;
  }
  return out;
}

/** The user's custom-tag library: every distinct non-built-in tag across their clients, A→Z. */
export function collectCustomTags(clients: { work_types?: string[] | null }[]): string[] {
  const byLower = new Map<string, string>();
  for (const c of clients) {
    for (const t of c.work_types ?? []) {
      if (typeof t !== 'string' || isBuiltInWorkType(t)) continue;
      const clean = cleanTagText(t);
      if (clean && !byLower.has(clean.toLowerCase())) byLower.set(clean.toLowerCase(), clean);
    }
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
