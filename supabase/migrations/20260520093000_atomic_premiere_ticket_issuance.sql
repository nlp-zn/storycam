create or replace function public.issue_storycam_premiere_tickets(
  actor_user_id uuid,
  target_user_id uuid,
  ticket_count integer,
  ticket_source text,
  ticket_expires_at timestamptz default null,
  ticket_expires_in_days integer default null,
  ticket_note text default null
)
returns setof public.storycam_premiere_tickets
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if ticket_count < 1 or ticket_count > 100 then
    raise exception 'ticket_count must be between 1 and 100' using errcode = '22023';
  end if;

  if ticket_source not in ('manual_beta', 'support_compensation', 'internal_testing', 'creator_seed') then
    raise exception 'invalid premiere ticket source' using errcode = '22023';
  end if;

  if ticket_note is not null and char_length(ticket_note) > 500 then
    raise exception 'ticket_note must be 500 characters or fewer' using errcode = '22023';
  end if;

  return query
  with created as (
    insert into public.storycam_premiere_tickets (
      user_id,
      status,
      source,
      issued_by_user_id,
      note,
      expires_at
    )
    select
      target_user_id,
      'available',
      ticket_source,
      actor_user_id,
      nullif(ticket_note, ''),
      ticket_expires_at
    from generate_series(1, ticket_count)
    returning *
  ),
  audit as (
    insert into public.admin_audit_events (
      actor_user_id,
      target_user_id,
      action,
      metadata_json
    )
    select
      actor_user_id,
      target_user_id,
      'issue_premiere_tickets',
      jsonb_build_object(
        'count', (select count(*) from created),
        'expiresInDays', ticket_expires_in_days,
        'note', case when ticket_note is null then null else left(ticket_note, 120) end,
        'source', ticket_source
      )
    returning id
  )
  select created.*
  from created
  cross join audit;
end;
$$;

revoke all on function public.issue_storycam_premiere_tickets(uuid, uuid, integer, text, timestamptz, integer, text)
  from public, anon, authenticated;
grant execute on function public.issue_storycam_premiere_tickets(uuid, uuid, integer, text, timestamptz, integer, text)
  to service_role;
