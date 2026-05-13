# Job Lifecycle Snapshot

Status: implemented snapshot.

Sources: `src/server/storycam/generationJobService.ts`, `generationJobRepository.ts`, `imageGenerationJobService.ts`, `videoGenerationService.ts`, `finalWorkService.ts`, and related tests.

## Job Types

```ts
type GenerationJobType =
  | "story_world_asset_image"
  | "storyboard_image"
  | "expanded_storyboard_image"
  | "video_clip"
  | "final_work";
```

Text story-world/storyboard requests may return immediately or create artifacts through service logic; image, video, and final-work generation are the main job-backed workflows.

## Job Statuses

```ts
type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "canceled"
  | "expired";
```

## State Rules

```text
queued
  -> running
  -> succeeded | failed | expired

queued | running
  -> cancel_requested
  -> canceled
```

Rules:

- Terminal jobs must not become successful later.
- Retry creates a new attempt or job; it must not mutate a terminal failed/canceled/expired job into success.
- Deleted sessions tombstone active jobs and discard late provider results.
- Provider errors are normalized and redacted before storage/logging/client display.
- Browser polling is read-only; the worker owns production progress after job creation.

## Worker Claiming

The worker claims jobs through `claim_storycam_generation_jobs`:

- runnable statuses are `queued`, `running`, and `cancel_requested`,
- `run_after <= now()` gates delayed provider polling,
- stale locks can be reclaimed after the configured lock TTL,
- claims set `locked_by`, `locked_at`, and a short future `run_after`,
- `queued` jobs move to `running`, set `started_at`, and increment `attempts`,
- the SQL implementation uses `FOR UPDATE SKIP LOCKED` to avoid duplicate concurrent claims.

Completion methods clear `locked_by` and `locked_at`. Provider-pending jobs are released
with a future `run_after`. Workers must only mutate non-terminal, non-tombstoned jobs and
must discard late provider success after cancel/tombstone.

## Idempotency

Job creation routes require an idempotency key.

- Store only `idempotency_key_hash`.
- Duplicate active requests return the existing account-scoped job.
- Scope includes current user, session, route/workflow, and relevant parent artifact or group.
- Idempotency must not cross users or deleted sessions.

## Image Jobs

Story-world asset, core storyboard, and expanded storyboard image jobs:

- may start as placeholders while upstream reference media is missing or still generating,
- poll async provider state when using Inference.sh,
- download completed provider output server-side,
- store generated image media in private Storage,
- link output media/artifacts by user/session,
- degrade to redacted placeholder/failure state when provider output is invalid or unsupported.

## Video Jobs

Seedance video clip jobs:

- require a confirmed core storyboard group,
- assemble an internal clip prompt packet from stored artifacts,
- submit a provider task server-side,
- poll by provider task id or normalize webhook-shaped payloads,
- download `content.video_url` before provider URL expiry,
- store generated clip media in private Storage,
- discard late success if the job/session was canceled or tombstoned.

The user-facing rescue path for bad or failed video output is `重拍这个片段`.

## Final Work Jobs

Final work creation:

- remains account-scoped,
- starts as a durable `final_work` generation job from `POST /api/final-work`,
- is claimed and composed by the background worker, not by the browser request,
- may compose even a single generated clip into a final work artifact,
- stores preview/export media privately,
- does not create public sharing links in Phase 1.

## Job Record

```ts
type GenerationJob = {
  id: string;
  userId: string;
  sessionId: string;
  type: GenerationJobType;
  status: JobStatus;
  idempotencyKeyHash: string;
  generationMode: "mock" | "real";
  providerKind: "text" | "multimodal" | "image" | "video" | "stitch";
  providerName: string;
  providerRequestId?: string;
  attempts: number;
  maxAttempts: number;
  inputArtifactVersions: Record<string, number>;
  outputArtifactId?: string;
  errorCode?: string;
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  redactedError?: string;
  startedAt?: string;
  endedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  runAfter: string;
  tombstonedAt?: string;
};
```
