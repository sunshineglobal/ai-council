begin;

alter table public.council_runs
  add column if not exists error_message text;

commit;
