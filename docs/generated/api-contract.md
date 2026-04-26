# API Contract

Status: planned contract, to be regenerated from route schemas once implementation exists.
Source of truth until code exists: `docs/product-specs/storycam-film-machine-design.md` and `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`.

## Global Rules

- All real resource routes require Supabase Auth.
- Unauthenticated users may view the app shell and starter examples, but cannot upload photos, create sessions, generate clips, or create final work.
- All responses must be scoped to the current `auth.users.id`.
- API routes validate input, call server-only services, and return redacted responses.
- API routes must not call providers directly, bypass repositories, expose prompt packets, expose provider payloads, expose Supabase service role keys, or return long-lived public media URLs.
- Media preview uses short-lived signed URLs or an authenticated proxy.

## Error Shape

```ts
type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    redactionApplied: true;
    requestId?: string;
  };
};
```

Error bodies must not include raw private input, full prompts, full prompt packets, provider secrets, signed URLs, or unredacted provider errors.

## Common Types

```ts
type ArtifactState = "idle" | "generating" | "ready" | "failed" | "skipped" | "stale";

type GenerationMode = "mock" | "real";

type ProviderKind = "text" | "multimodal" | "image" | "video" | "stitch";

type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "canceled"
  | "expired";

type MediaRef = {
  id: string;
  kind: "uploaded_photo" | "mock_clip" | "generated_clip" | "final_work" | "thumbnail";
  mimeType: string;
  byteSize: number;
  previewUrl?: string;
  previewExpiresAt?: string;
};
```

## Routes

### `POST /api/uploads`

Upload a user photo to Supabase Storage.

Auth: required.

Request:

- `multipart/form-data`
- `file`: image file
- `kind`: `uploaded_photo`
- `sessionId?`: optional existing session

Validation:

- Accept image MIME types only.
- Enforce max file size from config.
- Reject executable, unknown, or empty files.

Success:

```ts
type UploadResponse = {
  ok: true;
  media: MediaRef;
  sessionId: string;
  uploadedPhotoIds: string[];
  uploadedPhotoRefs: Array<{ mediaAssetId: string }>;
};
```

### `POST /api/story-world`

Create or update the story world artifacts from text, lightweight choices, and optional uploaded photos.

Auth: required.

Request:

```ts
type StoryWorldRequest = {
  sessionId?: string;
  input: string;
  lightweightChoices: string[];
  uploadedPhotoIds?: string[];
  plannedDurationSeconds?: number;
  generationMode?: GenerationMode;
};
```

Success:

```ts
type StoryWorldResponse = {
  ok: true;
  sessionId: string;
  artifacts: {
    script: VersionedArtifact;
    characterAssets: VersionedArtifact[];
    sceneAssets: VersionedArtifact[];
    qualityChecks: VersionedArtifact[];
  };
};
```

Rules:

- Does not generate storyboard.
- Does not start video generation.
- Uploaded photos must belong to current user.

### `POST /api/storyboard`

Generate storyboard script and 1-3 core storyboard groups from confirmed story world artifacts.

Auth: required.

Request:

```ts
type StoryboardRequest = {
  sessionId: string;
  confirmedArtifactVersions: Record<string, number>;
  plannedDurationSeconds: number;
};
```

Success:

```ts
type StoryboardResponse = {
  ok: true;
  sessionId: string;
  storyboardScript: VersionedArtifact;
  coreStoryboardGroups: VersionedArtifact[];
  artifacts: {
    storyboardScript: VersionedArtifact;
    coreStoryboardGroups: VersionedArtifact[];
  };
  durationPlan: {
    plannedDurationSeconds: number;
    coreGroupTargetCount: 1 | 2 | 3;
    clipDurationTargets: number[];
  };
};
```

Rules:

- Reject if story world is not confirmed.
- Group count is derived from planned duration.
- Downstream stale artifacts must be handled by service layer.

### `POST /api/storyboard-groups/:id/expand`

Generate expanded storyboard cards for one core group.

Auth: required.

Request:

```ts
type ExpansionRequest = {
  sessionId: string;
  coreStoryboardGroupId: string;
  action?: "default" | "more" | "new_angle" | "stronger_emotion";
  targetCount?: number;
};
```

Success:

```ts
type ExpansionResponse = {
  ok: true;
  sessionId: string;
  expandedStoryboardCards: VersionedArtifact[];
};
```

Rules:

- Default target is 3 cards.
- Maximum is 8 cards.
- Expansion never creates a video job.

### `POST /api/storyboard-groups/:id/generate-clip`

Create a clip prompt packet and enqueue a video generation job.

Auth: required.

Request:

```ts
type GenerateClipRequest = {
  sessionId: string;
  coreStoryboardGroupId: string;
  idempotencyKey: string;
  confirmedArtifactVersions: Record<string, number>;
  providerSendConfirmed: true;
  generationMode?: GenerationMode;
};
```

Success:

```ts
type GenerateClipResponse = {
  ok: true;
  jobId: string;
  status: JobStatus;
  confirmationSummary: string;
};
```

Rules:

- `providerSendConfirmed` must be true.
- Response must not include full clip prompt packet.
- Duplicate `idempotencyKey` returns the existing active job.

### `GET /api/generation-jobs/:id`

Poll job status.

Auth: required.

Success:

```ts
type GenerationJobResponse = {
  ok: true;
  job: {
    id: string;
    sessionId: string;
    type: "story_world" | "storyboard" | "video_clip" | "final_work";
    status: JobStatus;
    providerKind: ProviderKind;
    providerName: string;
    attempts: number;
    retryable?: boolean;
    redactedError?: string;
    outputArtifactId?: string;
  };
};
```

### `POST /api/generation-jobs/:id/cancel`

Request job cancellation.

Auth: required.

Success:

```ts
type CancelJobResponse = {
  ok: true;
  jobId: string;
  status: "cancel_requested" | "canceled";
};
```

Rules:

- Tombstone locally even if provider cannot cancel.
- Late provider results must be discarded.

### `POST /api/stitch-suggestion`

Create a stitch suggestion for confirmed clips.

Auth: required.

Request:

```ts
type StitchSuggestionRequest = {
  sessionId: string;
  generatedClipArtifactIds: string[];
};
```

Success:

```ts
type StitchSuggestionResponse = {
  ok: true;
  stitchSuggestion: VersionedArtifact;
};
```

### `POST /api/final-work`

Generate final work and store it in Supabase Storage.

Auth: required.

Request:

```ts
type FinalWorkRequest = {
  sessionId: string;
  stitchSuggestionArtifactId: string;
  idempotencyKey: string;
};
```

Success:

```ts
type FinalWorkResponse = {
  ok: true;
  finalWork: VersionedArtifact;
  media: MediaRef;
};
```

Rules:

- A single clip still creates a new final work artifact.
- Final work is account-scoped preview/save only.
- No sharing link is created in Phase 1.

## Versioned Artifact Shape

```ts
type VersionedArtifact = {
  id: string;
  type: string;
  state: ArtifactState;
  version: number;
  parentArtifactId?: string;
  data: unknown;
  dependsOn?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};
```
