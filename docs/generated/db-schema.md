# Generated DB Schema Summary

Source: `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`

Status: planning summary, not generated from a live database yet.

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

## Regeneration Rule

Replace this file with generated output once Supabase migrations exist.
