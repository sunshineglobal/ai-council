-- Prevent authenticated users from changing identity or authorization fields on
-- their own profile. Service-role operations used by the application are not
-- affected by these grants.
revoke update on table public.profiles from anon, authenticated;
grant update (default_save_history) on table public.profiles to authenticated;

drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles self settings update" on public.profiles;
create policy "profiles self settings update"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Composite keys make tenant ownership part of the relationship instead of a
-- convention that service-role application code must remember to enforce.
create unique index if not exists chat_threads_id_user_id_key
  on public.chat_threads (id, user_id);
create unique index if not exists council_runs_id_user_id_key
  on public.council_runs (id, user_id);
create unique index if not exists file_attachments_id_user_id_key
  on public.file_attachments (id, user_id);
create unique index if not exists eval_sets_id_user_id_key
  on public.eval_sets (id, user_id);
create unique index if not exists eval_runs_id_user_id_key
  on public.eval_runs (id, user_id);

alter table public.council_runs
  add constraint council_runs_thread_owner_fkey
  foreign key (thread_id, user_id)
  references public.chat_threads (id, user_id)
  on delete cascade;

alter table public.research_results
  add constraint research_results_run_owner_fkey
  foreign key (run_id, user_id)
  references public.council_runs (id, user_id)
  on delete cascade;

alter table public.usage_events
  add constraint usage_events_run_owner_fkey
  foreign key (run_id, user_id)
  references public.council_runs (id, user_id)
  on delete cascade;

alter table public.run_file_attachments
  add constraint run_file_attachments_run_owner_fkey
  foreign key (run_id, user_id)
  references public.council_runs (id, user_id)
  on delete cascade;

alter table public.run_file_attachments
  add constraint run_file_attachments_file_owner_fkey
  foreign key (file_id, user_id)
  references public.file_attachments (id, user_id);

alter table public.eval_runs
  add constraint eval_runs_set_owner_fkey
  foreign key (eval_set_id, user_id)
  references public.eval_sets (id, user_id)
  on delete cascade;

-- Index the foreign-key and hydration paths used by the chat/eval APIs.
create index if not exists model_responses_run_id_idx
  on public.model_responses (run_id);
create index if not exists model_critiques_run_id_idx
  on public.model_critiques (run_id);
create index if not exists judge_rankings_run_id_idx
  on public.judge_rankings (run_id);
create index if not exists research_results_run_id_idx
  on public.research_results (run_id);
create index if not exists eval_scores_eval_run_id_idx
  on public.eval_scores (eval_run_id);
create index if not exists run_file_attachments_file_id_idx
  on public.run_file_attachments (file_id);

alter table public.usage_events
  add constraint usage_events_nonnegative_check
  check (
    prompt_tokens >= 0
    and completion_tokens >= 0
    and total_tokens >= 0
    and latency_ms >= 0
    and estimated_cost >= 0
  );

alter table public.eval_scores
  add constraint eval_scores_score_range_check
  check (score is null or score between 0 and 100);
