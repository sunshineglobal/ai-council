-- Shared serverless guardrails. These tables are intentionally inaccessible to
-- browser roles; the application reaches them through service-role-only RPCs.

begin;

-- The browser client is used for authentication only. All application data
-- access goes through authenticated server routes, so direct PostgREST writes
-- would only provide a way to bypass validation, quotas, and audit logging.
revoke all on table
  public.profiles,
  public.invites,
  public.chat_threads,
  public.council_runs,
  public.research_results,
  public.debate_rounds,
  public.model_responses,
  public.model_critiques,
  public.judge_rankings,
  public.usage_events,
  public.eval_sets,
  public.eval_runs,
  public.eval_scores,
  public.file_attachments,
  public.run_file_attachments
from anon, authenticated;

-- Uploads also flow through the server so MIME checks, per-user quotas, and
-- text-only storage normalization cannot be bypassed with the public key.
drop policy if exists "council attachment objects read" on storage.objects;
drop policy if exists "council attachment objects insert" on storage.objects;
drop policy if exists "council attachment objects update" on storage.objects;
drop policy if exists "council attachment objects delete" on storage.objects;

create table if not exists public.rate_limit_windows (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, key_hash, window_started_at)
);

create table if not exists public.operation_leases (
  scope text not null,
  key_hash text not null,
  lease_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

create table if not exists public.usage_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_usd numeric(12, 6) not null check (amount_usd > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.rate_limit_windows enable row level security;
alter table public.operation_leases enable row level security;
alter table public.usage_budget_reservations enable row level security;

revoke all on table public.rate_limit_windows from public, anon, authenticated;
revoke all on table public.operation_leases from public, anon, authenticated;
revoke all on table public.usage_budget_reservations from public, anon, authenticated;
grant all on table public.rate_limit_windows to service_role;
grant all on table public.operation_leases to service_role;
grant all on table public.usage_budget_reservations to service_role;

create index if not exists usage_budget_reservations_user_expiry_idx
  on public.usage_budget_reservations (user_id, expires_at);
create index if not exists file_attachments_ephemeral_cleanup_idx
  on public.file_attachments (created_at)
  where saved_mode = false and deleted_at is null;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_retry integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_windows (
    scope,
    key_hash,
    window_started_at,
    request_count
  )
  values (p_scope, p_key_hash, v_window_start, 1)
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = public.rate_limit_windows.request_count + 1
  returning request_count into v_count;

  v_retry := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );

  return query
    select
      v_count <= p_limit,
      greatest(0, p_limit - v_count),
      case when v_count <= p_limit then 0 else v_retry end;
end;
$$;

create or replace function public.acquire_operation_lease(
  p_scope text,
  p_key_hash text,
  p_lease_token uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if p_ttl_seconds < 1 then
    raise exception 'Invalid lease duration';
  end if;

  insert into public.operation_leases (
    scope,
    key_hash,
    lease_token,
    expires_at
  )
  values (
    p_scope,
    p_key_hash,
    p_lease_token,
    clock_timestamp() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (scope, key_hash)
  do update set
    lease_token = excluded.lease_token,
    expires_at = excluded.expires_at,
    created_at = clock_timestamp()
  where public.operation_leases.expires_at <= clock_timestamp()
  returning lease_token into v_token;

  return coalesce(v_token = p_lease_token, false);
end;
$$;

create or replace function public.release_operation_lease(
  p_scope text,
  p_key_hash text,
  p_lease_token uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.operation_leases
  where scope = p_scope
    and key_hash = p_key_hash
    and lease_token = p_lease_token;
$$;

create or replace function public.reserve_usage_budget(
  p_user_id uuid,
  p_amount_usd numeric,
  p_default_budget_usd numeric,
  p_ttl_seconds integer default 1200
)
returns table (
  allowed boolean,
  reservation_id uuid,
  budget_usd numeric,
  spent_usd numeric,
  reserved_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_budget numeric;
  v_budget numeric;
  v_spent numeric;
  v_reserved numeric;
  v_reservation_id uuid;
begin
  if p_amount_usd <= 0 or p_default_budget_usd < 0 or p_ttl_seconds < 1 then
    raise exception 'Invalid budget reservation';
  end if;

  select monthly_budget_usd
    into v_profile_budget
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_budget := coalesce(v_profile_budget, p_default_budget_usd);

  select coalesce(sum(estimated_cost), 0)
    into v_spent
  from public.usage_events
  where user_id = p_user_id
    and created_at >= date_trunc('month', clock_timestamp());

  select coalesce(sum(amount_usd), 0)
    into v_reserved
  from public.usage_budget_reservations
  where user_id = p_user_id
    and expires_at > clock_timestamp();

  if v_budget <= 0 or v_spent + v_reserved + p_amount_usd > v_budget then
    return query select false, null::uuid, v_budget, v_spent, v_reserved;
    return;
  end if;

  insert into public.usage_budget_reservations (
    user_id,
    amount_usd,
    expires_at
  )
  values (
    p_user_id,
    p_amount_usd,
    clock_timestamp() + make_interval(secs => p_ttl_seconds)
  )
  returning id into v_reservation_id;

  return query select true, v_reservation_id, v_budget, v_spent, v_reserved;
end;
$$;

create or replace function public.release_usage_budget_reservation(
  p_user_id uuid,
  p_reservation_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.usage_budget_reservations
  where id = p_reservation_id
    and user_id = p_user_id;
$$;

create or replace function public.attachment_storage_usage_bytes(
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(file_size), 0)::bigint
  from public.file_attachments
  where user_id = p_user_id
    and deleted_at is null;
$$;

create or replace function public.prune_production_guardrails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_count integer := 0;
begin
  delete from public.rate_limit_windows
  where window_started_at < clock_timestamp() - interval '2 days';
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  delete from public.operation_leases
  where expires_at <= clock_timestamp();
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  delete from public.usage_budget_reservations
  where expires_at <= clock_timestamp();
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  return v_deleted;
end;
$$;

revoke execute on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.acquire_operation_lease(text, text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.release_operation_lease(text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.reserve_usage_budget(uuid, numeric, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.release_usage_budget_reservation(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.attachment_storage_usage_bytes(uuid)
  from public, anon, authenticated;
revoke execute on function public.prune_production_guardrails()
  from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.acquire_operation_lease(text, text, uuid, integer)
  to service_role;
grant execute on function public.release_operation_lease(text, text, uuid)
  to service_role;
grant execute on function public.reserve_usage_budget(uuid, numeric, numeric, integer)
  to service_role;
grant execute on function public.release_usage_budget_reservation(uuid, uuid)
  to service_role;
grant execute on function public.attachment_storage_usage_bytes(uuid)
  to service_role;
grant execute on function public.prune_production_guardrails()
  to service_role;

commit;
