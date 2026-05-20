# Generated DB Schema Summary

Source: `supabase/migrations/20260426033600_storycam_phase1_schema.sql` plus follow-up migrations in `supabase/migrations/`.

Status: implemented migration snapshot, not introspected from a live database.

## Supabase Tables

### `storycam_sessions`

- `id`
- `user_id`
- `status`
- `generation_mode`
- `video_aspect_ratio`
- `planned_duration_seconds`
- `core_group_target_count`
- `created_at`
- `updated_at`
- `deleted_at`

Current duration constraints:

- `planned_duration_seconds`: database allows 8-45 seconds; the MVP creation flow writes 15 seconds.
- `core_group_target_count`: database allows 1-3 groups for historical compatibility; the MVP creation flow writes 1 group.
- `video_aspect_ratio`: database allows `16:9` or `9:16`; existing rows default to `16:9`.

### `storycam_artifacts`

- `id`
- `user_id`
- `session_id`
- `type`
- `state`
- `version`
- `parent_artifact_id`
- `data_json`
- `depends_on_json`
- `created_at`
- `updated_at`
- `stale_at`
- `deleted_at`

### `generation_jobs`

- `id`
- `user_id`
- `session_id`
- `premiere_ticket_id`
- `type`
- `status`
- `idempotency_key_hash`
- `generation_mode`
- `provider_kind`
- `provider_name`
- `provider_request_id`
- `attempts`
- `max_attempts`
- `input_artifact_versions_json`
- `output_artifact_id`
- `error_code`
- `provider_error_category`
- `provider_http_status`
- `redacted_error`
- `started_at`
- `ended_at`
- `locked_by`
- `locked_at`
- `run_after`
- `created_at`
- `updated_at`
- `tombstoned_at`

### `storycam_premiere_tickets`

- `id`
- `user_id`
- `status`: `available`, `reserved`, `spent`, or `expired`
- `reserved_session_id`
- `source`: `new_user_auto`, `manual_beta`, `support_compensation`, `internal_testing`, or `creator_seed`
- `issued_by_user_id`
- `note`
- `expires_at`
- `reserved_at`
- `spent_at`
- `created_at`
- `updated_at`

`new_user_auto` has a partial unique index so each user receives at most one automatic
ticket. Tickets include account-scoped foreign keys so a reserved ticket cannot point at
another user's session.

### `admin_audit_events`

- `id`
- `actor_user_id`
- `target_user_id`
- `action`
- `metadata_json`
- `created_at`

Admin audit rows are server-owned; no authenticated-user RLS select policy exposes them to
ordinary users.

### `media_assets`

- `id`
- `user_id`
- `session_id`
- `kind`
- `mime_type`
- `byte_size`
- `storage_bucket`
- `storage_path`
- `source`
- `linked_artifact_id`
- `source_media_asset_id`
- `provider_reference_expires_at`
- `created_at`
- `deleted_at`

### `provider_requests`

- `id`
- `user_id`
- `job_id`
- `provider_kind`
- `provider_name`
- `provider_request_id`
- `request_summary_json`
- `response_summary_json`
- `status`
- `created_at`
- `updated_at`

## Supabase Functions

- `soft_delete_storycam_session(user_id, session_id)`: tombstones a user-owned session and
  related in-flight jobs/artifacts/media.
- `claim_storycam_generation_jobs(worker_id, job_types, limit_count, lock_ttl_seconds)`:
  atomically claims runnable jobs for the background worker with `FOR UPDATE SKIP LOCKED`,
  writes `locked_by`/`locked_at`, advances `queued` jobs to `running`, increments
  `attempts`, and returns claimed `generation_jobs` rows. Execute permission is revoked
  from `public`, `anon`, and `authenticated`; the worker calls it with the service role.
- `issue_storycam_premiere_tickets(actor_user_id, target_user_id, ticket_count,
  ticket_source, ticket_expires_at, ticket_expires_in_days, ticket_note)`: atomically
  inserts one manual premiere-ticket batch and the matching `admin_audit_events` row,
  then returns created `storycam_premiere_tickets` rows. Execute permission is revoked
  from `public`, `anon`, and `authenticated`; the admin API calls it with the service
  role.

## Storage Buckets

- `storycam-uploads`
- `storycam-generated`
- `storycam-mock`

## Security Baseline

- All StoryCam metadata tables include `user_id uuid not null references auth.users(id) on delete cascade`.
- Row-level security is enabled for every StoryCam metadata table.
- Table policies scope select, insert, update, and delete to `auth.uid() = user_id`.
- Follow-up migrations add account-scoped composite foreign keys so admin-client writes cannot attach artifacts, jobs, media, or provider requests to another user's session/job/artifact.
- Premiere-ticket migrations add account-scoped foreign keys between tickets, sessions,
  and generation jobs. Ordinary users may select their own ticket metadata; inserts,
  updates, manual issuance, and audit rows remain server-owned. Manual issuance and
  audit logging happen inside `issue_storycam_premiere_tickets` so admin retries cannot
  mint duplicate tickets after a partial audit failure.
- Storage buckets are private and object policies scope access to `users/{auth.uid()}/...` paths.
- `soft_delete_storycam_session` tombstones in-flight jobs and soft deletes related artifacts/media/session metadata inside one database function.

## Regeneration Rule

Replace this file with introspected output once Supabase local or a test project is wired into CI.
