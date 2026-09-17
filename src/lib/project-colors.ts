import type { ProjectType } from '@/features/projects/types';

// Single source of truth for type → color, shared by the Projects list,
// the Today badges, and anywhere else a project needs a swatch.
export const TYPE_COLOR: Record<ProjectType, string> = {
  client: 'var(--pine)',
  internal: 'var(--sage)',
  opensource: 'var(--rust)',
  mobile: 'var(--gold)',
  game: 'var(--violet)',
  web: 'var(--cyan)',
  content: 'var(--plumrose)',
  assess: 'var(--slate)',
  bounty: 'var(--crimson)',
};

export const TYPE_LABEL: Record<ProjectType, string> = {
  client: 'Client Projects',
  internal: 'Internal Tools',
  opensource: 'Open Source',
  mobile: 'Mobile Apps',
  game: 'Games',
  web: 'Web Apps',
  content: 'Content',
  assess: 'Assessments',
  bounty: 'Bug Bounty',
};

/** One short line per type, shown under the picker so the labels aren't
 *  guesswork — "internal" vs "open source" is the pair people mix up most. */
export const TYPE_HINT: Record<ProjectType, string> = {
  client: 'Paid work for a client — unlocks quotes & invoices.',
  internal: 'Your own private tools; nothing published, no client.',
  opensource: 'Public repo or package — releases, stars, downloads.',
  mobile: 'iOS / Android app.',
  game: 'Game build of any size.',
  web: 'Website or web app.',
  content: 'Courses, writing, video, teaching material.',
  assess: 'Security assessment or audit engagement.',
  bounty: 'Bug bounty program — unlocks the submissions tab.',
};

/** Stable display order for pickers and filter chips. */
export const TYPE_ORDER: ProjectType[] = [
  'client',
  'internal',
  'opensource',
  'mobile',
  'game',
  'web',
  'content',
  'assess',
  'bounty',
];

type TypeCarrier = { type: ProjectType; types?: ProjectType[] | null };

/**
 * Every type a project carries, primary first.
 *
 * Rows written before multi-select existed only have `type`, so fall back to
 * it rather than rendering a project with no type at all. Unknown strings are
 * dropped so a stale value can't crash a colour lookup.
 */
export function projectTypes(p: TypeCarrier): [ProjectType, ...ProjectType[]] {
  const list = (p.types ?? []).filter((t): t is ProjectType => t in TYPE_COLOR);
  const [first, ...rest] = Array.from(new Set(list));
  return first ? [first, ...rest] : [p.type];
}

export function primaryType(p: TypeCarrier): ProjectType {
  return projectTypes(p)[0];
}

export function hasType(p: TypeCarrier, t: ProjectType): boolean {
  return projectTypes(p).includes(t);
}
