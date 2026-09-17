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
  targets: Targets;
  /** Where `scaffoldProject` is allowed to create folders. */
  code_root: string;
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
