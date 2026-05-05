alter table public.generation_jobs
  drop constraint if exists generation_jobs_type_check;

alter table public.generation_jobs
  add constraint generation_jobs_type_check
  check (
    type in (
      'story_world',
      'story_world_asset_image',
      'storyboard',
      'storyboard_image',
      'expanded_storyboard_image',
      'video_clip',
      'final_work'
    )
  );
