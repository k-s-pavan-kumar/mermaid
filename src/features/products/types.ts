/**
 * A Product is one thing you ship as a family: the SaaS, plus an app, a book,
 * a game and the marketing around it. Each piece is an ordinary project that
 * carries a product_id and a role; the product page lays them out in four
 * lanes — Tech, Education, Fun to learn, Marketing.
 */
export interface Product {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  /** Target launch day; drives the launch plan, the calendar and the digest. */
  launch_date?: string | null;
  created_at: string;
}

export type ProductRole = 'saas' | 'app' | 'book' | 'game' | 'marketing' | 'other';
export type Lane = 'tech' | 'education' | 'fun' | 'marketing' | 'other';

export interface RoleInfo {
  role: ProductRole;
  label: string;
  lane: Lane;
  /** The project type a new piece is created as. */
  projectType: string;
  /** Name of the Field (tag) a new piece is filed under, if you have it. */
  fieldName: string | null;
}

export const ROLES: RoleInfo[] = [
  { role: 'saas',      label: 'SaaS',      lane: 'tech',      projectType: 'web',       fieldName: 'SaaS' },
  { role: 'app',       label: 'App',       lane: 'tech',      projectType: 'mobile',    fieldName: 'SaaS' },
  { role: 'book',      label: 'Book',      lane: 'education', projectType: 'content',   fieldName: 'Publishing' },
  { role: 'game',      label: 'Game',      lane: 'fun',       projectType: 'game',      fieldName: 'Gaming' },
  { role: 'marketing', label: 'Marketing', lane: 'marketing', projectType: 'marketing', fieldName: 'Digital Marketing' },
];

export const LANES: { lane: Lane; label: string; blurb: string; roles: ProductRole[] }[] = [
  { lane: 'tech',      label: 'Tech',         blurb: 'The SaaS and its app',          roles: ['saas', 'app'] },
  { lane: 'education', label: 'Education',    blurb: 'The book',                      roles: ['book'] },
  { lane: 'fun',       label: 'Fun to learn', blurb: 'The game',                      roles: ['game'] },
  { lane: 'marketing', label: 'Marketing',    blurb: 'Launch and growth',             roles: ['marketing'] },
];

export function roleInfo(role: string | null | undefined): RoleInfo | undefined {
  return ROLES.find((r) => r.role === role);
}

export function isProductRole(r: string): r is ProductRole {
  return ROLES.some((x) => x.role === r);
}

/** Done pieces / all pieces, 0–100. */
export function productProgress(statuses: string[]): number {
  const live = statuses.filter((s) => s !== 'dropped');
  return live.length ? Math.round((live.filter((s) => s === 'done').length / live.length) * 100) : 0;
}
