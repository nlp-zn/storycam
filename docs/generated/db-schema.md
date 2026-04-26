# Generated DB Schema Summary

Source: `supabase/migrations/20260426033600_storycam_phase1_schema.sql`

Status: static migration summary, not introspected from a live database yet.

## Supabase Tables

### `storycam_sessions`

- `id`
- `user_id`
- `status`
- `generation_mode`
- `planned_duration_seconds`
- `core_group_target_count`
- `created_at`
- `updated_at`
- `deleted_at`

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
- `redacted_error`
- `started_at`
- `ended_at`
- `created_at`
- `updated_at`
- `tombstoned_at`

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

## Storage Buckets

- `storycam-uploads`
- `storycam-generated`
- `storycam-mock`

## Security Baseline

- All StoryCam metadata tables include `user_id uuid not null references auth.users(id) on delete cascade`.
- Row-level security is enabled for every StoryCam metadata table.
- Table policies scope select, insert, update, and delete to `auth.uid() = user_id`.
- Storage buckets are private and object policies scope access to `users/{auth.uid()}/...` paths.

## Regeneration Rule

Replace this file with introspected output once Supabase local or a test project is wired into CI.
