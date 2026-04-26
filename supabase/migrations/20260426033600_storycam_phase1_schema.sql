create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.storycam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'generating', 'ready', 'deleted')),
  generation_mode text not null default 'mock' check (generation_mode in ('mock', 'real')),
  planned_duration_seconds integer not null default 12 check (planned_duration_seconds between 8 and 15),
  core_group_target_count integer not null default 1 check (core_group_target_count between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists storycam_sessions_user_id_idx on public.storycam_sessions(user_id);
create index if not exists storycam_sessions_deleted_at_idx on public.storycam_sessions(deleted_at);
drop trigger if exists set_storycam_sessions_updated_at on public.storycam_sessions;
create trigger set_storycam_sessions_updated_at
before update on public.storycam_sessions
for each row execute function public.set_updated_at();

create table if not exists public.storycam_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.storycam_sessions(id) on delete cascade,
  type text not null check (
    type in (
      'input',
      'script',
      'character_asset',
      'scene_asset',
      'storyboard_script',
      'core_storyboard_group',
      'expanded_storyboard_card',
      'clip_prompt_packet',
      'generated_clip',
      'stitch_suggestion',
      'final_work',
      'quality_check'
    )
  ),
  state text not null default 'idle' check (state in ('idle', 'generating', 'ready', 'failed', 'skipped', 'stale')),
  version integer not null check (version > 0),
  parent_artifact_id uuid references public.storycam_artifacts(id) on delete set null,
  data_json jsonb not null default '{}'::jsonb,
  depends_on_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stale_at timestamptz,
  deleted_at timestamptz,
  constraint clip_prompt_packet_requires_dependencies
    check (type <> 'clip_prompt_packet' or depends_on_json <> '{}'::jsonb)
);

create index if not exists storycam_artifacts_user_id_idx on public.storycam_artifacts(user_id);
create index if not exists storycam_artifacts_session_type_version_idx
  on public.storycam_artifacts(session_id, type, version);
create index if not exists storycam_artifacts_parent_artifact_id_idx
  on public.storycam_artifacts(parent_artifact_id);
create index if not exists storycam_artifacts_deleted_at_idx on public.storycam_artifacts(deleted_at);
drop trigger if exists set_storycam_artifacts_updated_at on public.storycam_artifacts;
create trigger set_storycam_artifacts_updated_at
before update on public.storycam_artifacts
for each row execute function public.set_updated_at();

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.storycam_sessions(id) on delete cascade,
  type text not null check (type in ('story_world', 'storyboard', 'video_clip', 'final_work')),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancel_requested', 'canceled', 'expired')
  ),
  idempotency_key_hash text not null,
  generation_mode text not null default 'mock' check (generation_mode in ('mock', 'real')),
  provider_kind text not null check (provider_kind in ('text', 'multimodal', 'image', 'video', 'stitch')),
  provider_name text not null,
  provider_request_id text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 1 check (max_attempts > 0),
  input_artifact_versions_json jsonb not null default '{}'::jsonb,
  output_artifact_id uuid references public.storycam_artifacts(id) on delete set null,
  error_code text,
  redacted_error text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tombstoned_at timestamptz
);

create index if not exists generation_jobs_user_id_idx on public.generation_jobs(user_id);
create index if not exists generation_jobs_session_id_idx on public.generation_jobs(session_id);
create index if not exists generation_jobs_type_status_idx on public.generation_jobs(type, status);
create index if not exists generation_jobs_idempotency_key_hash_idx on public.generation_jobs(idempotency_key_hash);
drop trigger if exists set_generation_jobs_updated_at on public.generation_jobs;
create trigger set_generation_jobs_updated_at
before update on public.generation_jobs
for each row execute function public.set_updated_at();

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.storycam_sessions(id) on delete cascade,
  kind text not null check (kind in ('uploaded_photo', 'mock_clip', 'generated_clip', 'final_work', 'thumbnail')),
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  storage_bucket text not null,
  storage_path text not null,
  source text not null check (source in ('upload', 'mock', 'provider', 'composer')),
  linked_artifact_id uuid references public.storycam_artifacts(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_assets_storage_path_unique unique (storage_bucket, storage_path)
);

create index if not exists media_assets_user_id_idx on public.media_assets(user_id);
create index if not exists media_assets_session_kind_idx on public.media_assets(session_id, kind);
create index if not exists media_assets_linked_artifact_id_idx on public.media_assets(linked_artifact_id);
create index if not exists media_assets_deleted_at_idx on public.media_assets(deleted_at);

create table if not exists public.provider_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('text', 'multimodal', 'image', 'video', 'stitch')),
  provider_name text not null,
  provider_request_id text,
  request_summary_json jsonb not null default '{}'::jsonb,
  response_summary_json jsonb,
  status text not null default 'submitted' check (status in ('submitted', 'succeeded', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_requests_user_id_idx on public.provider_requests(user_id);
create index if not exists provider_requests_job_id_idx on public.provider_requests(job_id);
drop trigger if exists set_provider_requests_updated_at on public.provider_requests;
create trigger set_provider_requests_updated_at
before update on public.provider_requests
for each row execute function public.set_updated_at();

alter table public.storycam_sessions enable row level security;
alter table public.storycam_artifacts enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.provider_requests enable row level security;

do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array[
    'storycam_sessions',
    'storycam_artifacts',
    'generation_jobs',
    'media_assets',
    'provider_requests'
  ]
  loop
    policy_name := target_table || '_select_own';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', policy_name, target_table);
    end if;

    policy_name := target_table || '_insert_own';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', policy_name, target_table);
    end if;

    policy_name := target_table || '_update_own';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', policy_name, target_table);
    end if;

    policy_name := target_table || '_delete_own';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = policy_name) then
      execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', policy_name, target_table);
    end if;
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('storycam-uploads', 'storycam-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('storycam-generated', 'storycam-generated', false, 524288000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('storycam-mock', 'storycam-mock', false, 524288000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'storycam_storage_select_own') then
    create policy storycam_storage_select_own
    on storage.objects for select
    using (
      bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'storycam_storage_insert_own') then
    create policy storycam_storage_insert_own
    on storage.objects for insert
    with check (
      bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'storycam_storage_update_own') then
    create policy storycam_storage_update_own
    on storage.objects for update
    using (
      bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    with check (
      bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'storycam_storage_delete_own') then
    create policy storycam_storage_delete_own
    on storage.objects for delete
    using (
      bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;
end;
$$;

create or replace function public.soft_delete_storycam_session(
  target_user_id uuid,
  target_session_id uuid,
  target_deleted_at timestamptz default now()
)
returns void
language plpgsql
security invoker
as $$
begin
  update public.generation_jobs
  set status = case
      when status in ('queued', 'running') then 'expired'
      else status
    end,
    tombstoned_at = coalesce(tombstoned_at, target_deleted_at),
    updated_at = target_deleted_at
  where user_id = target_user_id
    and session_id = target_session_id
    and tombstoned_at is null;

  update public.storycam_artifacts
  set deleted_at = coalesce(deleted_at, target_deleted_at),
      updated_at = target_deleted_at
  where user_id = target_user_id
    and session_id = target_session_id
    and deleted_at is null;

  update public.media_assets
  set deleted_at = coalesce(deleted_at, target_deleted_at)
  where user_id = target_user_id
    and session_id = target_session_id
    and deleted_at is null;

  update public.storycam_sessions
  set status = 'deleted',
      deleted_at = coalesce(deleted_at, target_deleted_at),
      updated_at = target_deleted_at
  where user_id = target_user_id
    and id = target_session_id
    and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_storycam_session(uuid, uuid, timestamptz) to authenticated;
