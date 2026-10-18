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
  is_field: boolean;
  /** 'tpn' marks the TPN audit field: its page is /tpn-audits and its goals never mix with other fields. */
  special: 'tpn' | null;
  sort_order: number;
  created_at: string;
}

export const TAG_COLORS = ['#5F3DEB', '#D99A18', '#00A0A6', '#B8449B', '#DE7438', '#2B94C9', '#3C8D5A', '#E23B6B', '#5C6180'] as const;

export const DEFAULT_FIELDS: { name: string; color: string; special: 'tpn' | null }[] = [
  { name: 'SaaS', color: '#5F3DEB', special: null },
  { name: 'Gaming', color: '#B8449B', special: null },
  { name: 'Publishing', color: '#D99A18', special: null },
  { name: 'TPN Auditing', color: '#2B94C9', special: 'tpn' },
  { name: 'Teaching', color: '#3C8D5A', special: null },
  { name: 'Digital Marketing', color: '#DE7438', special: null },
  { name: 'Client Work', color: '#00A0A6', special: null },
];

export const MAX_TAG_LENGTH = 30;

export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

export const isHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

/** Where a field's page lives. */
export function fieldHref(t: Pick<Tag, 'id' | 'special'>): string {
  return t.special === 'tpn' ? '/tpn-audits' : `/fields/${t.id}`;
}
