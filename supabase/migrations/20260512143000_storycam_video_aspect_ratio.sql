alter table public.storycam_sessions
  add column if not exists video_aspect_ratio text not null default '16:9';

alter table public.storycam_sessions
  drop constraint if exists storycam_sessions_video_aspect_ratio_check;

alter table public.storycam_sessions
  add constraint storycam_sessions_video_aspect_ratio_check
  check (video_aspect_ratio in ('16:9', '9:16'));
