alter table public.storycam_sessions
  drop constraint if exists storycam_sessions_planned_duration_seconds_check;

alter table public.storycam_sessions
  add constraint storycam_sessions_planned_duration_seconds_check
  check (planned_duration_seconds between 8 and 45);
