insert into storage.buckets (id, name, public, file_size_limit)
values ('council-attachments', 'council-attachments', false, 5242880)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create table if not exists public.file_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'council-attachments',
  object_path text not null unique,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size >= 0),
  extracted_text text,
  text_preview text,
  extraction_status text not null default 'none' check (extraction_status in ('ready', 'unsupported', 'too_large', 'failed', 'none')),
  extraction_error text,
  saved_mode boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.run_file_attachments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  file_id uuid references public.file_attachments(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size >= 0),
  text_preview text,
  extraction_status text not null default 'none' check (extraction_status in ('ready', 'unsupported', 'too_large', 'failed', 'none')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, file_id)
);

alter table public.file_attachments enable row level security;
alter table public.run_file_attachments enable row level security;

drop policy if exists "file attachments owner" on public.file_attachments;
drop policy if exists "run file attachments owner" on public.run_file_attachments;

create policy "file attachments owner" on public.file_attachments for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "run file attachments owner" on public.run_file_attachments for all
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.council_runs r
        where r.id = run_file_attachments.run_id
          and r.user_id = auth.uid()
      )
    )
  )
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.council_runs r
        where r.id = run_file_attachments.run_id
          and r.user_id = auth.uid()
      )
    )
  );

drop policy if exists "council attachment objects read" on storage.objects;
drop policy if exists "council attachment objects insert" on storage.objects;
drop policy if exists "council attachment objects update" on storage.objects;
drop policy if exists "council attachment objects delete" on storage.objects;

create policy "council attachment objects read" on storage.objects for select to authenticated
  using (
    bucket_id = 'council-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "council attachment objects insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'council-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "council attachment objects update" on storage.objects for update to authenticated
  using (
    bucket_id = 'council-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'council-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "council attachment objects delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'council-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create index if not exists file_attachments_user_id_created_at_idx on public.file_attachments (user_id, created_at desc);
create index if not exists file_attachments_user_id_deleted_at_idx on public.file_attachments (user_id, deleted_at);
create index if not exists run_file_attachments_run_id_sort_idx on public.run_file_attachments (run_id, sort_order);
