# Job Lifecycle

Status: planned contract, to be regenerated from `GenerationJob` implementation once code exists.

## Job Types

```ts
type GenerationJobType = "story_world" | "storyboard" | "video_clip" | "final_work";
```

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

## State Transitions

```text
queued
  -> running
  -> succeeded
  -> failed
  -> expired

queued
  -> cancel_requested
  -> canceled

running
  -> cancel_requested
  -> canceled

running
  -> expired
```

Invalid transitions:

- `succeeded -> running`
- `failed -> succeeded`
- `canceled -> succeeded`
- `expired -> succeeded`

Retry creates a new attempt or job according to service policy; it must not mutate a terminal job into success.

## Idempotency

Job creation routes require `idempotencyKey`.

Rules:

- Store only `idempotency_key_hash`.
- Duplicate active request returns existing job.
- Idempotency scope includes current user, session, route, and parent artifact.

## Tombstone And Late Results

If a session or job is canceled/deleted:

1. Set `tombstoned_at`.
2. Try provider cancel when supported.
3. Keep local metadata for audit/debug.
4. Discard provider results that arrive after tombstone.
5. Do not create output artifacts from late results.

## Timeout

Timeout behavior:

- `queued` jobs can expire if never picked up.
- `running` jobs can expire if provider exceeds configured timeout.
- Expired video jobs keep the clip prompt packet for retry.
- User-facing rescue path for unstable video output is `重拍这一段`.

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
  redactedError?: string;
  startedAt?: string;
  endedAt?: string;
  tombstonedAt?: string;
};
```
