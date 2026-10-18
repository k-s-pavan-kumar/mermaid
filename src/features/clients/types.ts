export interface Client {
  id: string;
  owner_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  timezone: string; // IANA, e.g. 'America/New_York'
  /** What you actually do for them — multi-select, because one client is
   *  rarely one kind of work (a web build that later becomes a retainer
   *  plus a training day). */
  work_types: WorkType[];
  /** Agreed TOTAL project cost (fixed price for the whole engagement, not
   *  per hour). Pre-fills the first line of a new quote/invoice and drives
   *  the "left to invoice" figure on the client page. */
  project_cost: number | null;
  /** 'project' = one fixed project cost; 'monthly' = recurring retainer (e.g. digital marketing). */
  billing_type: BillingType;
  /** Agreed amount per month, for monthly clients. */
  monthly_fee: number | null;
  /** First month billed, 'YYYY-MM-01'. Months before it are never expected. */
  retainer_start: string | null;
  /** Day of the month the payment is due (1–28). After it, an unreceived month is overdue. */
  retainer_due_day: number | null;
  status: ClientStatus;
  notes: string | null;
  /** Random token for the read-only client portal link. Rotating it
   *  instantly revokes any link you've already shared. */
  portal_token: string | null;
  created_at: string;
}

export type BillingType = 'project' | 'monthly';

export type ClientStatus = 'active' | 'paused' | 'past' | 'lead';

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  paused: 'Paused',
  past: 'Past',
};

/** The tags that ship with the app. Everything else is a custom tag the user typed. */
export type BuiltInWorkType =
  | 'web'
  | 'mobile'
  | 'design'
  | 'security'
  | 'teaching'
  | 'consulting'
  | 'maintenance'
  | 'content'
  | 'marketing';

/**
 * A work-type tag on a client: a built-in key ('web', 'mobile'…) or the text of
 * a custom tag the user added ('Photography'). Custom tags are stored on the
 * client as typed, so there is no separate tag table to keep in sync.
 */
export type WorkType = string;

export const WORK_TYPE_LABEL: Record<BuiltInWorkType, string> = {
  web: 'Web development',
  mobile: 'Mobile app',
  design: 'Design / UI-UX',
  security: 'Security assessment',
  teaching: 'Teaching / training',
  consulting: 'Consulting',
  maintenance: 'Maintenance / retainer',
  content: 'Content',
  marketing: 'Digital marketing',
};

export const WORK_TYPE_COLOR: Record<BuiltInWorkType, string> = {
  web: 'var(--cyan)',
  mobile: 'var(--gold)',
  design: 'var(--plumrose)',
  security: 'var(--slate)',
  teaching: 'var(--sage)',
  consulting: 'var(--pine)',
  maintenance: 'var(--rust)',
  content: 'var(--violet)',
  marketing: 'var(--plumrose)',
};

export const WORK_TYPES = Object.keys(WORK_TYPE_LABEL) as BuiltInWorkType[];

export const MAX_CUSTOM_TAG_LENGTH = 30;
export const MAX_WORK_TAGS = 12;
const CUSTOM_TAG_COLORS = ['var(--crimson)', 'var(--cyan)', 'var(--rust)', 'var(--violet)', 'var(--sage)', 'var(--gold)', 'var(--plumrose)'];

export function isBuiltInWorkType(t: string): t is BuiltInWorkType {
  return Object.prototype.hasOwnProperty.call(WORK_TYPE_LABEL, t);
}

/**
 * Typed text -> a tag. Typing a built-in's name ("web development", "Mobile
 * app") returns that built-in's key rather than creating a lookalike; anything
 * else is kept as typed (trimmed, single spaces, capped). Empty -> ''.
 */
export function normaliseWorkTag(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_CUSTOM_TAG_LENGTH);
  if (!t) return '';
  const lower = t.toLowerCase();
  if (isBuiltInWorkType(lower)) return lower;
  const hit = WORK_TYPES.find((k) => WORK_TYPE_LABEL[k].toLowerCase() === lower);
  return hit ?? t;
}

/** Normalise a whole list: drops blanks, dedupes case-insensitively, caps the count. */
export function normaliseWorkTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = normaliseWorkTag(r);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= MAX_WORK_TAGS) break;
  }
  return out;
}

export function workTypeLabel(t: WorkType): string {
  return isBuiltInWorkType(t) ? WORK_TYPE_LABEL[t] : t;
}

export function workTypeColor(t: WorkType): string {
  if (isBuiltInWorkType(t)) return WORK_TYPE_COLOR[t];
  let h = 0;
  for (const ch of t.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_TAG_COLORS[h % CUSTOM_TAG_COLORS.length]!;
}

export function clientWorkTypes(c: Pick<Client, 'work_types'>): WorkType[] {
  return normaliseWorkTags(c.work_types ?? []);
}

/** Every custom tag used by any client, A–Z — offered again when adding the next client. */
export function customWorkTags(clients: Pick<Client, 'work_types'>[]): string[] {
  const seen = new Map<string, string>();
  for (const c of clients) for (const t of clientWorkTypes(c)) {
    if (!isBuiltInWorkType(t) && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
