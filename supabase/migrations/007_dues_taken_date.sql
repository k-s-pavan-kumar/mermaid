-- When a due's amount was taken (or given, for money owed to you), so the
-- Dues tracker shows when it started next to how it's being paid. Additive
-- and idempotent — safe to run once against an existing database.

alter table finance_obligations add column if not exists taken_date date;
