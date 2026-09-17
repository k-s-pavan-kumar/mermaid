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
  /** Default hourly/session rate used to pre-fill invoice line items. */
  rate: number | null;
  status: ClientStatus;
  notes: string | null;
  /** Random token for the read-only client portal link. Rotating it
   *  instantly revokes any link you've already shared. */
  portal_token: string | null;
  created_at: string;
}

export type ClientStatus = 'active' | 'paused' | 'past' | 'lead';

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  paused: 'Paused',
  past: 'Past',
};

export type WorkType =
  | 'web'
  | 'mobile'
  | 'design'
  | 'security'
  | 'teaching'
  | 'consulting'
  | 'maintenance'
  | 'content';

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  web: 'Web development',
  mobile: 'Mobile app',
  design: 'Design / UI-UX',
  security: 'Security assessment',
  teaching: 'Teaching / training',
  consulting: 'Consulting',
  maintenance: 'Maintenance / retainer',
  content: 'Content',
};

export const WORK_TYPE_COLOR: Record<WorkType, string> = {
  web: 'var(--cyan)',
  mobile: 'var(--gold)',
  design: 'var(--plumrose)',
  security: 'var(--slate)',
  teaching: 'var(--sage)',
  consulting: 'var(--pine)',
  maintenance: 'var(--rust)',
  content: 'var(--violet)',
};

export const WORK_TYPES = Object.keys(WORK_TYPE_LABEL) as WorkType[];

export function clientWorkTypes(c: Pick<Client, 'work_types'>): WorkType[] {
  return (c.work_types ?? []).filter((t): t is WorkType => t in WORK_TYPE_LABEL);
}
