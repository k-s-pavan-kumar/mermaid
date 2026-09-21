-- Dues now track an amount to pay and a due date, with any number of
-- payments posted against them (balance + pending/partial/cleared status are
-- computed from finance_entries.linked_obligation_id). Additive and
-- idempotent — safe to run once against an existing database.

alter table finance_obligations add column if not exists due_date date;
