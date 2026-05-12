do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storycam_sessions_id_user_id_key') then
    alter table public.storycam_sessions
      add constraint storycam_sessions_id_user_id_key unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'storycam_artifacts_id_user_id_key') then
    alter table public.storycam_artifacts
      add constraint storycam_artifacts_id_user_id_key unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_id_user_id_key') then
    alter table public.generation_jobs
      add constraint generation_jobs_id_user_id_key unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'storycam_artifacts_session_owner_fk') then
    alter table public.storycam_artifacts
      add constraint storycam_artifacts_session_owner_fk
      foreign key (session_id, user_id)
      references public.storycam_sessions(id, user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'storycam_artifacts_parent_owner_fk') then
    alter table public.storycam_artifacts
      add constraint storycam_artifacts_parent_owner_fk
      foreign key (parent_artifact_id, user_id)
      references public.storycam_artifacts(id, user_id)
      on delete set null (parent_artifact_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_session_owner_fk') then
    alter table public.generation_jobs
      add constraint generation_jobs_session_owner_fk
      foreign key (session_id, user_id)
      references public.storycam_sessions(id, user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_output_artifact_owner_fk') then
    alter table public.generation_jobs
      add constraint generation_jobs_output_artifact_owner_fk
      foreign key (output_artifact_id, user_id)
      references public.storycam_artifacts(id, user_id)
      on delete set null (output_artifact_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'media_assets_session_owner_fk') then
    alter table public.media_assets
      add constraint media_assets_session_owner_fk
      foreign key (session_id, user_id)
      references public.storycam_sessions(id, user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'media_assets_linked_artifact_owner_fk') then
    alter table public.media_assets
      add constraint media_assets_linked_artifact_owner_fk
      foreign key (linked_artifact_id, user_id)
      references public.storycam_artifacts(id, user_id)
      on delete set null (linked_artifact_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_requests_job_owner_fk') then
    alter table public.provider_requests
      add constraint provider_requests_job_owner_fk
      foreign key (job_id, user_id)
      references public.generation_jobs(id, user_id)
      on delete cascade
      not valid;
  end if;
end;
$$;
