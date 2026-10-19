/**
 * Tags live in ONE table and are used everywhere a label is needed (client
 * "type of work", goals, projects). A tag with is_field = true is a Field: it
 * also gets its own sidebar page with its own yearly targets, so SaaS, Gaming,
 * Publishing, Teaching… each stay out of each other's way.
 *
 * Tags are referenced by NAME on clients (work_types holds names), so a tag
 * can be created and deleted but not renamed — a rename would orphan them.
 */
export interface Tag {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  /** Key from icons.tsx; null/absent = a default picked from the name. */
  icon?: string | null;
  is_field: boolean;
  /** 'tpn' / 'bounty' mark fields that already have their own page (/tpn-audits, /bounty-pipeline); their goals never mix with other fields. */
  special: 'tpn' | 'bounty' | null;
  sort_order: number;
  created_at: string;
}

export const TAG_COLORS = ['#5F3DEB', '#D99A18', '#00A0A6', '#B8449B', '#DE7438', '#2B94C9', '#3C8D5A', '#E23B6B', '#5C6180'] as const;

export const DEFAULT_FIELDS: { name: string; color: string; special: 'tpn' | 'bounty' | null }[] = [
  { name: 'SaaS', color: '#5F3DEB', special: null },
  { name: 'Gaming', color: '#B8449B', special: null },
  { name: 'Book Publishing', color: '#D99A18', special: null },
  { name: 'TPN Auditing', color: '#2B94C9', special: 'tpn' },
  { name: 'Bug Bounty', color: '#E23B6B', special: 'bounty' },
  { name: 'Digital Marketing', color: '#DE7438', special: null },
];

/** Sidebar order for the well-known fields; anything else follows by its own sort order. */
export const FIELD_ORDER = ['saas', 'gaming', 'book publishing', 'publishing', 'tpn auditing', 'bug bounty', 'digital marketing'];

export const MAX_TAG_LENGTH = 30;

export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

export const isHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

/** Where a field's page lives. */
export function fieldHref(t: Pick<Tag, 'id' | 'special'>): string {
  return t.special === 'tpn' ? '/tpn-audits' : t.special === 'bounty' ? '/bounty-pipeline' : `/fields/${t.id}`;
}

/** The project type a new project in this field starts as. */
export function fieldProjectType(t: Pick<Tag, 'name' | 'special'>): string {
  if (t.special === 'tpn') return 'assess';
  if (t.special === 'bounty') return 'bounty';
  const n = t.name.toLowerCase();
  if (n.includes('saas')) return 'web';
  if (n.includes('gam')) return 'game';
  if (n.includes('publish') || n.includes('book')) return 'content';
  if (n.includes('market')) return 'marketing';
  if (n.includes('teach')) return 'teaching';
  return 'internal';
}
