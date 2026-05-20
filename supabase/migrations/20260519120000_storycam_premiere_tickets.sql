create table if not exists public.storycam_premiere_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'available' check (status in ('available', 'reserved', 'spent', 'expired')),
  reserved_session_id uuid references public.storycam_sessions(id) on delete set null,
  source text not null check (
    source in ('new_user_auto', 'manual_beta', 'support_compensation', 'internal_testing', 'creator_seed')
  ),
  issued_by_user_id uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  expires_at timestamptz,
  reserved_at timestamptz,
  spent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storycam_premiere_tickets_new_user_auto_idx
  on public.storycam_premiere_tickets(user_id)
  where source = 'new_user_auto';
create index if not exists storycam_premiere_tickets_user_status_idx
  on public.storycam_premiere_tickets(user_id, status, created_at);
create index if not exists storycam_premiere_tickets_reserved_session_idx
  on public.storycam_premiere_tickets(reserved_session_id);

drop trigger if exists set_storycam_premiere_tickets_updated_at on public.storycam_premiere_tickets;
create trigger set_storycam_premiere_tickets_updated_at
before update on public.storycam_premiere_tickets
for each row execute function public.set_updated_at();

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('issue_premiere_tickets')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_actor_idx
  on public.admin_audit_events(actor_user_id, created_at desc);
create index if not exists admin_audit_events_target_idx
  on public.admin_audit_events(target_user_id, created_at desc);

alter table public.generation_jobs
  add column if not exists premiere_ticket_id uuid references public.storycam_premiere_tickets(id) on delete set null;

create index if not exists generation_jobs_premiere_ticket_idx
  on public.generation_jobs(premiere_ticket_id, type, status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storycam_premiere_tickets_id_user_id_key') then
    alter table public.storycam_premiere_tickets
      add constraint storycam_premiere_tickets_id_user_id_key unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'storycam_premiere_tickets_session_owner_fk') then
    alter table public.storycam_premiere_tickets
      add constraint storycam_premiere_tickets_session_owner_fk
      foreign key (reserved_session_id, user_id)
      references public.storycam_sessions(id, user_id)
      on delete set null (reserved_session_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_premiere_ticket_owner_fk') then
    alter table public.generation_jobs
      add constraint generation_jobs_premiere_ticket_owner_fk
      foreign key (premiere_ticket_id, user_id)
      references public.storycam_premiere_tickets(id, user_id)
      on delete set null (premiere_ticket_id)
      not valid;
  end if;
end;
$$;

alter table public.storycam_premiere_tickets enable row level security;
alter table public.admin_audit_events enable row level security;

drop policy if exists storycam_premiere_tickets_select_own on public.storycam_premiere_tickets;
create policy storycam_premiere_tickets_select_own
  on public.storycam_premiere_tickets
  for select
  using (auth.uid() = user_id);
