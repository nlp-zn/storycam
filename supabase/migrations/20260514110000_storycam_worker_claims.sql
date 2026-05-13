alter table public.generation_jobs
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists run_after timestamptz not null default now();

create index if not exists generation_jobs_worker_claim_idx
  on public.generation_jobs(status, run_after, locked_at, created_at)
  where tombstoned_at is null
    and status in ('queued', 'running', 'cancel_requested');

create or replace function public.claim_storycam_generation_jobs(
  worker_id text,
  job_types text[],
  limit_count integer default 5,
  lock_ttl_seconds integer default 300
)
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if worker_id is null or btrim(worker_id) = '' then
    raise exception 'worker_id is required';
  end if;

  return query
  with picked as (
    select id
    from public.generation_jobs
    where tombstoned_at is null
      and status in ('queued', 'running', 'cancel_requested')
      and type = any(job_types)
      and run_after <= now()
      and (
        locked_at is null
        or locked_at < now() - make_interval(secs => greatest(lock_ttl_seconds, 1))
      )
    order by run_after asc, created_at asc
    limit greatest(least(coalesce(limit_count, 5), 20), 1)
    for update skip locked
  )
  update public.generation_jobs job
  set
    attempts = case when job.status = 'queued' then job.attempts + 1 else job.attempts end,
    locked_at = now(),
    locked_by = worker_id,
    run_after = now(),
    started_at = coalesce(job.started_at, now()),
    status = case when job.status = 'queued' then 'running' else job.status end
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

revoke all on function public.claim_storycam_generation_jobs(text, text[], integer, integer) from public;
revoke all on function public.claim_storycam_generation_jobs(text, text[], integer, integer) from anon;
revoke all on function public.claim_storycam_generation_jobs(text, text[], integer, integer) from authenticated;
grant execute on function public.claim_storycam_generation_jobs(text, text[], integer, integer) to service_role;
