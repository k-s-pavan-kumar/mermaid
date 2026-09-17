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

export interface WorkspaceSettings {
  id: string;
  owner_id: string;
  clocks: ClockWidget[];
  business: BusinessProfile;
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
