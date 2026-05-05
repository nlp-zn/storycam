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
  };
  storyWorld: {
    script: {
      title: string;
      logline: string;
      summary: string;
      visualStyle?: string;
      beats: string[];
      version: number;
    };
    characterAssets: Array<{
      name: string;
      role: string;
      relationshipToUserStory: string;
      stableVisualDescription: string;
      emotionalBaseline: string;
      wardrobe?: string;
      props: string[];
    }>;
    sceneAssets: Array<{
      name: string;
      location: string;
      timeOfDay: string;
      light: string;
      atmosphere: string;
      keyObjects: string[];
      scenePanels: Array<{
        title: string;
        shotType: "establishing" | "wide" | "medium" | "detail" | "lighting" | "overhead" | "transition";
        description: string;
        purpose: string;
        keyObjects: string[];
      }>;
      spatialLogic: string;
    }>;
  };
};
```

Rules:

- Does not generate storyboard.
- Does not start video generation.
- Returns 1-3 key character assets and exactly 1 scene asset. The single scene asset carries 4-6 `scenePanels` for the multi-panel environment asset image.
- `script.visualStyle` is the shared style anchor for character and scene asset images; older restored stories may omit it.
- Uploaded photos must belong to current user.

### `POST /api/storyboard`

Generate the MVP 15-second storyboard: one 9-frame storyboard script plus one core storyboard group from confirmed story world artifacts.

### `GET /api/storycam-sessions/recent?limit=5`

List current user's recent restorable StoryCam projects for the homepage drawer. Empty drafts and upload-only sessions are skipped.

```ts
type RecentProjectsResponse = {
  ok: true;
  projects: Array<{
    sessionId: string;
    title: string;
    summary: string;
    currentStep: "story-world" | "core-storyboard";
    updatedAt: string;
    coreGroupTargetCount: 1 | 2 | 3;
    thumbnail: null | {
      id: string;
      mimeType: string;
      signedUrl: string;
      signedUrlExpiresIn: number;
    };
  }>;
};
```

### `GET /api/storycam-sessions/:id/restore`

Restore a specific current-user project selected from recent projects. Returns the same restored shape as `/api/storycam-sessions/current`; missing, deleted, unauthorized, or non-restorable sessions return `404 not_found`.

Storyboard image state:

```ts
type StoryboardImageState =
  | {
      status: "ready";
      placeholder: false;
      mediaId: string;
      mimeType: string;
      signedUrl: string;
      signedUrlExpiresIn: number;
    }
  | {
      status: "generating";
      placeholder: true;
      jobId: string;
    }
  | {
      status: "placeholder";
      placeholder: true;
      reason?: "waiting_for_asset_images" | "reference_images_unsupported" | "provider_failed" | "storage_failed";
    };
```

Auth: required.

Request:

```ts
type StoryboardRequest = {
  sessionId: string;
  confirmedArtifactVersions: Record<string, number>;
  coreGroupTargetCount?: 1 | 2 | 3;
  plannedDurationSeconds?: number;
};
```

Compatibility: `coreGroupTargetCount` and `plannedDurationSeconds` remain accepted for older clients and restored data, but new MVP storyboard creation normalizes all requests to `coreGroupTargetCount: 1`, `plannedDurationSeconds: 15`, and `clipDurationTargets: [15]`.

Success:

```ts
type StoryboardResponse = {
  ok: true;
  sessionId: string;
  storyboardScript: VersionedArtifact;
  coreStoryboardGroups: VersionedArtifact[];
  artifacts: {
    storyboardScript: VersionedArtifact;
    storyboardScripts: VersionedArtifact[];
    coreStoryboardGroups: VersionedArtifact[];
  };
  storyboard: {
    storyboardScript: {
      planSummary: string;
      tone: string;
      rhythm: string;
      plannedDurationSeconds: number;
      mainImagePrompt?: string;
      frames: StoryboardFrame[];
      version: number;
    };
    storyboardScripts: Array<{
      planSummary: string;
      tone: string;
      rhythm: string;
      plannedDurationSeconds: number;
      mainImagePrompt?: string;
      frames: StoryboardFrame[];
      version: number;
    }>;
    coreStoryboardGroups: Array<{
      title: string;
      storyPurpose: string;
      emotionalTurn: string;
      estimatedClipDurationSeconds: number;
      scriptArtifact: VersionedArtifact;
      representativeImage: StoryboardImageState;
      expandedStoryboardImages: StoryboardImageState[];
      version: number;
    }>;
  };
  durationPlan: {
    plannedDurationSeconds: number;
    coreGroupTargetCount: 1 | 2 | 3;
    clipDurationTargets: number[];
  };
};

type StoryboardFrame = {
  frameNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  canvasPosition: "center" | "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right";
  timeRange: string;
  durationSeconds: number;
  cameraAngle: string;
  shotSize: string;
  visualContent: string;
  scene: string;
  sound: string;
  technicalNotes: string;
  narrativePurpose: string;
  title: string;
  beatType: string;
  imagePrompt: string;
};
```

Rules:

- Reject if story world is not confirmed.
- New MVP results contain exactly 1 group, targeting about 15 seconds and exactly 9 storyboard frames.
- The representative core image is generated from frame 1 only after all referenced story-world character and scene asset images have ready thumbnails.
- If required asset images are not ready, `representativeImage` returns a placeholder with `reason: "waiting_for_asset_images"` and no storyboard image job is submitted.
- If the configured storyboard image provider does not support reference images, image generation returns `reason: "reference_images_unsupported"` instead of falling back to pure text prompts.
- Planned total duration is 15 seconds for new storyboard creation.
- Downstream stale artifacts must be handled by service layer.

### `POST /api/storyboard-groups/:id/expand`

Generate expanded storyboard cards for one core group from that group's stored frames 2-9.

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
  expansionCards: Array<{
    beatType: string;
    frameNumber: number;
    canvasPosition: string;
    title: string;
    description: string;
    guidance: string;
    imagePrompt?: string;
    image: StoryboardImageState;
    sortOrder: number;
    version: number;
  }>;
  expandedStoryboardImages: StoryboardImageState[];
  expandedStoryboardCards: VersionedArtifact[];
};
```

Rules:

- Default target is 8 cards/images, derived from storyboard frames 2-9.
- Maximum is 8 cards.
- Expansion never creates a video job.
- Expanded storyboard image jobs require the same ready story-world character and scene asset image references as the core frame.
- Repeated expansion reuses existing expanded storyboard card artifacts instead of duplicating them.

### `POST /api/storyboard-groups/:id/frames/:frameNumber/regenerate-image`

Regenerate one storyboard frame image without accepting a user prompt. The server reuses the stored `imagePrompt` for that frame.

Auth: required.

Request:

```ts
type RegenerateStoryboardFrameImageRequest = {
  sessionId: string;
};
```

Success:

```ts
type RegenerateStoryboardFrameImageResponse = {
  ok: true;
  sessionId: string;
  frameNumber: number;
  image: StoryboardImageState;
};
```

Rules:

- `frameNumber=1` creates a `storyboard_image` job linked to the core storyboard group artifact.
- `frameNumber=2..9` creates an `expanded_storyboard_image` job linked to the corresponding expanded storyboard card artifact.
- Regeneration never accepts a user prompt and never bypasses required story-world asset image references.
- No free-form user prompt is accepted.

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
