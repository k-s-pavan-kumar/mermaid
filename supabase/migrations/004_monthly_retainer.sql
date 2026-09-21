-- Monthly retainer clients (e.g. digital marketing) and per-month payment
-- tracking. Idempotent.
--
-- Each month a client pays is stored as a PAID invoice carrying period
-- 'YYYY-MM'; "not received" is just the absence of one, so nothing has to
-- generate rows every month.

alter table clients add column if not exists billing_type text not null default 'project';
alter table clients add column if not exists monthly_fee numeric;
alter table clients add column if not exists retainer_start date;
alter table clients add column if not exists retainer_due_day int;

alter table clients drop constraint if exists clients_billing_type_check;
alter table clients add constraint clients_billing_type_check check (billing_type in ('project','monthly'));
alter table clients drop constraint if exists clients_retainer_due_day_check;
alter table clients add constraint clients_retainer_due_day_check check (retainer_due_day between 1 and 28);

-- Allow the new "Digital marketing" work type.
alter table clients drop constraint if exists clients_work_types_check;
alter table clients add constraint clients_work_types_check
  check (work_types <@ array['web','mobile','design','security','teaching','consulting','maintenance','content','marketing']::text[]);

alter table invoices add column if not exists period text;
alter table invoices drop constraint if exists invoices_period_check;
alter table invoices add constraint invoices_period_check check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

create unique index if not exists invoices_client_period_idx
  on invoices (client_id, period) where period is not null;
