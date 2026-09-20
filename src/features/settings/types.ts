/**
 * Workspace settings — one row per owner, stored as a single record so
 * adding a preference never means a migration. Everything the UI needs to
 * render chrome (clock widgets) or a document (invoice header) lives here.
 */
export interface ClockWidget {
  id: string;
  label: string;
  timezone: string;
  home: boolean;
}

export interface BusinessProfile {
  /** Who the invoice is *from*. */
  legal_name: string;
  address: string;
  email: string;
  phone: string;
  /** GSTIN / VAT / tax registration — printed only when set. */
  tax_id: string;
  /** Free text: account number, IFSC, UPI id, PayPal — whatever you get paid through. */
  payment_details: string;
  /** Percentage added to invoice totals; 0 hides the tax line entirely. */
  default_tax_pct: number;
  invoice_prefix: string;
  quote_prefix: string;
  footer_note: string;
}

/**
 * Targets — what "a good week" and "a good year" mean, in your numbers.
 *
 * Deliberately few, and all optional (0 = "not tracking this"). A dashboard
 * that demands a dozen targets before it shows anything is a dashboard
 * nobody fills in. Hours are the honest unit for effort and money is the
 * honest unit for the year, so those are what's here.
 */
export interface Targets {
  /** Hours of actual focused work per week. 0 hides the ring. */
  weekly_focus_hours: number;
  /** Tasks completed per week. */
  weekly_tasks: number;
  /** Days per week on which *something* moved — the streak-shaped target. */
  weekly_active_days: number;
  monthly_focus_hours: number;
  monthly_tasks: number;
  /** Revenue you want invoiced-and-paid in a month. */
  monthly_revenue: number;
  /** The headline number for the year. */
  yearly_revenue: number;
  currency: string;
  /**
   * Which month the financial year starts in, 1-12. India's runs April to
   * March, so defaulting to January would quietly mis-scope every "this
   * year so far" figure for the person this was built for.
   */
  fiscal_year_start_month: number;
}

export interface WorkspaceSettings {
  id: string;
  owner_id: string;
  clocks: ClockWidget[];
  business: BusinessProfile;
  /**
   * The targets in effect *today* — a convenience snapshot computed from
   * `targets_history` at read time, not stored directly. Kept on
   * WorkspaceSettings so anything that just wants "what applies right now"
   * (the "no targets set" banner, a default currency) doesn't need to know
   * targets are versioned at all. Historical, period-accurate lookups go
   * through `pickTargets()` in the dashboard queries instead.
   */
  targets: Targets;
  /**
   * User-defined categories for the Dashboard's 24-hour split — "deep
   * work", "admin", "learning" — as an alternative to bucketing by project
   * type. Empty by default: until you define one, every task buckets by
   * its project's type exactly as before.
   */
  categories: CategoryDef[];
  /**
   * The Reward Vault's friction windows — configurable per person since the
   * right amount of friction to impose on yourself is a personal call, not
   * a constant. Defaults to DEFAULT_* in reward-vault/types.ts when absent.
   */
  reward_vault: RewardVaultConfig;
  /** Where `scaffoldProject` is allowed to create folders. */
  code_root: string;
}

export interface RewardVaultConfig {
  cooldown_hours: number;
  expiry_days: number;
  /** 0–1, the fraction of a linked project's invoice a Need's price may not
   *  exceed. */
  spend_cap_pct: number;
  /** Flat cap for a course-linked Need, which has no invoice to be a
   *  percentage of. */
  course_cap: number;
  /** Auto-post a Daily Finance expense when a Need is marked purchased. */
  auto_post_purchases: boolean;
}

/** A custom bucket for the 24-hour pie, defined once in Settings and then
 *  assignable to any task. */
export interface CategoryDef {
  key: string;
  label: string;
  color: string;
}

/**
 * One dated version of Targets. "What was my target back in June" is a
 * question the app can only answer if targets are a history rather than a
 * single row that silently gets overwritten — so every change to targets
 * creates a new version rather than editing one in place. The version whose
 * `effective_from` is the latest date not after a given day is the target
 * that applied on that day.
 */
export interface TargetsVersion {
  id: string;
  owner_id: string;
  effective_from: string; // 'YYYY-MM-DD'
  targets: Targets;
  created_at: string;
}

export const DEFAULT_CLOCKS: ClockWidget[] = [
  { id: 'c_home', label: 'Hyderabad', timezone: 'Asia/Kolkata', home: true },
  { id: 'c_ny', label: 'New York', timezone: 'America/New_York', home: false },
  { id: 'c_ldn', label: 'London', timezone: 'Europe/London', home: false },
  { id: 'c_sg', label: 'Singapore', timezone: 'Asia/Singapore', home: false },
  { id: 'c_la', label: 'Los Angeles', timezone: 'America/Los_Angeles', home: false },
];

export const DEFAULT_BUSINESS: BusinessProfile = {
  legal_name: '',
  address: '',
  email: '',
  phone: '',
  tax_id: '',
  payment_details: '',
  default_tax_pct: 0,
  invoice_prefix: 'INV',
  quote_prefix: 'QT',
  footer_note: 'Thank you for your business.',
};

/**
 * Zeroes rather than invented numbers: every ring and bar on the Dashboard
 * hides itself when its target is 0, so a fresh install shows the *actual*
 * picture (hours spent, money invoiced) without pretending you signed up to
 * a goal you never set.
 */
export const DEFAULT_TARGETS: Targets = {
  weekly_focus_hours: 0,
  weekly_tasks: 0,
  weekly_active_days: 0,
  monthly_focus_hours: 0,
  monthly_tasks: 0,
  monthly_revenue: 0,
  yearly_revenue: 0,
  currency: 'INR',
  fiscal_year_start_month: 4,
};

/** No custom categories out of the box — every task buckets by its
 *  project's type until you define your first one. */
export const DEFAULT_CATEGORIES: CategoryDef[] = [];

export const DEFAULT_REWARD_VAULT: RewardVaultConfig = {
  cooldown_hours: 48,
  expiry_days: 14,
  spend_cap_pct: 0.5,
  course_cap: 10_000,
  auto_post_purchases: true,
};

/** A friendly palette to pick from when defining a category, so the first
 *  one someone adds doesn't default to a jarring pure red or pure blue. */
export const CATEGORY_COLOR_CHOICES = [
  '#5F3DEB', '#0EA5A4', '#DB7C3E', '#C44FB5', '#3B82F6',
  '#65A30D', '#DC2626', '#7C3AED', '#0891B2', '#B45309',
];
