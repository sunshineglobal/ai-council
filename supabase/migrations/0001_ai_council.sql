create extension if not exists "pgcrypto";
create extension if not exists "citext";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_role') then
    create type public.profile_role as enum ('admin', 'member');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'run_status') then
    create type public.run_status as enum ('queued', 'running', 'complete', 'failed');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  role public.profile_role not null default 'member',
  default_save_history boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  role public.profile_role not null default 'member',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  is_ephemeral boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.council_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  prompt_text text,
  final_answer text,
  judge_model text not null,
  models jsonb not null default '[]',
  debate_depth integer not null check (debate_depth between 1 and 4),
  research_enabled boolean not null default false,
  saved_mode boolean not null default true,
  status public.run_status not null default 'queued',
  token_totals jsonb not null default '{}',
  cost_estimate numeric(12, 6) not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text,
  results jsonb,
  result_count integer not null default 0,
  firecrawl_credits numeric(12, 4) not null default 0,
  saved_mode boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.debate_rounds (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  round_index integer not null,
  created_at timestamptz not null default now(),
  unique (run_id, round_index)
);

create table if not exists public.model_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  model_id text not null,
  stage text not null,
  content text,
  token_usage jsonb not null default '{}',
  latency_ms integer not null default 0,
  status text not null default 'complete',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.model_critiques (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  round_index integer not null,
  model_id text not null,
  target_model_id text,
  content text,
  token_usage jsonb not null default '{}',
  latency_ms integer not null default 0,
  status text not null default 'complete',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.judge_rankings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  judge_model text not null,
  rankings jsonb not null default '[]',
  synthesis text,
  token_usage jsonb not null default '{}',
  latency_ms integer not null default 0,
  status text not null default 'complete',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid references public.council_runs(id) on delete cascade,
  stage text not null,
  model_id text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  latency_ms integer not null default 0,
  status text not null default 'complete',
  estimated_cost numeric(12, 6) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.eval_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  rubric text not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  eval_set_id uuid references public.eval_sets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  council_config jsonb not null default '{}',
  baseline_label text,
  status public.run_status not null default 'queued',
  aggregate_score numeric(5, 2),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.eval_scores (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid not null references public.eval_runs(id) on delete cascade,
  item_index integer not null,
  prompt text not null,
  score numeric(5, 2),
  rationale text,
  final_answer text,
  judge_model text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.chat_threads enable row level security;
alter table public.council_runs enable row level security;
alter table public.research_results enable row level security;
alter table public.debate_rounds enable row level security;
alter table public.model_responses enable row level security;
alter table public.model_critiques enable row level security;
alter table public.judge_rankings enable row level security;
alter table public.usage_events enable row level security;
alter table public.eval_sets enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_scores enable row level security;

drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "invites admin read" on public.invites;
drop policy if exists "invites admin insert" on public.invites;
drop policy if exists "invites admin delete" on public.invites;
drop policy if exists "threads owner" on public.chat_threads;
drop policy if exists "runs owner" on public.council_runs;
drop policy if exists "research owner" on public.research_results;
drop policy if exists "usage owner" on public.usage_events;
drop policy if exists "eval sets owner" on public.eval_sets;
drop policy if exists "eval runs owner" on public.eval_runs;
drop policy if exists "rounds via run owner" on public.debate_rounds;
drop policy if exists "responses via run owner" on public.model_responses;
drop policy if exists "critiques via run owner" on public.model_critiques;
drop policy if exists "rankings via run owner" on public.judge_rankings;
drop policy if exists "eval scores via run owner" on public.eval_scores;

create policy "profiles self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "invites admin read" on public.invites for select using (public.is_admin());
create policy "invites admin insert" on public.invites for insert with check (public.is_admin());
create policy "invites admin delete" on public.invites for delete using (public.is_admin());

create policy "threads owner" on public.chat_threads for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "runs owner" on public.council_runs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "research owner" on public.research_results for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "usage owner" on public.usage_events for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "eval sets owner" on public.eval_sets for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "eval runs owner" on public.eval_runs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "rounds via run owner" on public.debate_rounds for all using (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
);

create policy "responses via run owner" on public.model_responses for all using (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
);

create policy "critiques via run owner" on public.model_critiques for all using (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
);

create policy "rankings via run owner" on public.judge_rankings for all using (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.council_runs r where r.id = run_id and (r.user_id = auth.uid() or public.is_admin()))
);

create policy "eval scores via run owner" on public.eval_scores for all using (
  exists (select 1 from public.eval_runs r where r.id = eval_run_id and (r.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.eval_runs r where r.id = eval_run_id and (r.user_id = auth.uid() or public.is_admin()))
);

create index if not exists chat_threads_user_id_updated_at_idx on public.chat_threads (user_id, updated_at desc);
create index if not exists council_runs_user_id_created_at_idx on public.council_runs (user_id, created_at desc);
create index if not exists council_runs_thread_id_created_at_idx on public.council_runs (thread_id, created_at desc);
create index if not exists usage_events_user_id_created_at_idx on public.usage_events (user_id, created_at desc);
create index if not exists eval_runs_user_id_created_at_idx on public.eval_runs (user_id, created_at desc);
