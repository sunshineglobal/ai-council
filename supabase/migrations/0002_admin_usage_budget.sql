alter table public.profiles
  add column if not exists monthly_budget_usd numeric(12, 6);
