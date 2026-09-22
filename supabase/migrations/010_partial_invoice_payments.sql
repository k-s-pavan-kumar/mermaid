-- Partial invoice payments — an invoice can now take several payments (each
-- its own finance_entries row: date, amount, optional note) before it's
-- fully paid, tracked with a new 'partial' status alongside the existing
-- draft/pending/paid/overdue. See recordInvoicePayment()/markInvoicePaid()/
-- deleteInvoicePayment() in src/features/billing/actions.ts.
--
-- Safe to run once against an existing database.

alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft','pending','partial','paid','overdue'));

-- The old unique index allowed at most one payment per invoice — exactly
-- the limitation this migration removes. Replaced with a plain (non-unique)
-- index so lookups by invoice are still fast.
drop index if exists finance_entries_invoice_once_idx;
create index if not exists finance_entries_invoice_idx
  on finance_entries(linked_invoice_id) where linked_invoice_id is not null;
