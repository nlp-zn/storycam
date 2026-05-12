# API Contract Snapshot

Status: implemented snapshot.

Sources: `src/app/api/**/route.ts`, `src/features/storycam/client/storycamApi.ts`, `src/server/storycam/*Service.ts`, and current Playwright/API tests.

## Global Rules

- Real resource routes require Supabase Auth, except app shell and public metadata routes.
- All session, artifact, job, media, and restore responses are scoped to the current `auth.users.id`.
- Route handlers validate input, call server-only services, and return redacted responses.
- Route handlers must not expose prompt packets, raw provider payloads, provider secrets, signed provider-reference URLs, or Supabase service-role keys.
- Media previews use short-lived signed URLs. Restore responses use `Cache-Control: no-store`.

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

## Auth And Session Routes

| Route | Purpose |
| --- | --- |
| `GET /api/auth/me` | Returns anonymous/authenticated account state without leaking server internals. |
| `POST /api/auth/sign-out` | Signs out and clears local auth bypass opt-out state. |
| `GET /auth/callback` | Exchanges Supabase OAuth callback and returns to StoryCam. |
| `GET /api/storycam-sessions/current` | Returns current account-scoped active session summary. |
| `GET /api/storycam-sessions/recent` | Returns recent account-scoped sessions for the input screen. |
| `DELETE /api/storycam-sessions/[id]` | Tombstones a user-owned session and cleans associated storage where applicable. |
| `GET /api/storycam-sessions/[id]/restore` | Restores a full account-scoped session snapshot with signed preview URLs. |

Restore responses and recent-project summaries may be cached client-side in `sessionStorage` only for the current tab and authenticated user. Restore cache entries are additionally keyed by session id. These caches store JSON and signed URLs, never media bytes, and must preserve absolute URL expiry instead of extending old URLs.

## Creation And Story Routes

| Route | Purpose |
| --- | --- |
| `POST /api/uploads` | Uploads a user photo into private Storage and links it to a session. |
| `POST /api/story-world` | Creates/updates the story-world script, character assets, and scene asset. |
| `POST /api/story-world/assets/generate-image` | Starts or polls one story-world asset image job. |
| `POST /api/story-world/assets/generate-images` | Starts or polls batch story-world asset image jobs. |
| `POST /api/storyboard` | Creates the MVP storyboard script, one core group, and the main image prompt. |
| `POST /api/storyboard-groups/[id]/expand` | Creates expanded storyboard cards for the selected core group. |

New MVP storyboard creation normalizes to one core group, 15 seconds, and one generated clip target. Older restored data may still contain historical duration/count fields and must be tolerated.

## Clip And Final Work Routes

| Route | Purpose |
| --- | --- |
| `POST /api/storyboard-groups/[id]/generate-clip` | Creates or resumes a video generation job for the confirmed core group. |
| `GET /api/generation-jobs/[id]` | Polls an account-scoped generation job and returns normalized status/output. |
| `POST /api/generation-jobs/[id]/cancel` | Requests cancellation/tombstone and prevents late provider results from creating outputs. |
| `POST /api/stitch-suggestion` | Produces a user-facing final-work suggestion from confirmed clips. |
| `POST /api/final-work` | Creates the account-scoped final work preview/export artifact. |

The server-created clip prompt packet is internal. The UI may show plain product status such as `720p`, ready/failure states, and retry/retake actions, but must not show provider payloads or professional shot-table data.

## Media Refs

```ts
type MediaRef = {
  id: string;
  kind:
    | "uploaded_photo"
    | "story_world_asset"
    | "storyboard_image"
    | "expanded_storyboard_image"
    | "mock_clip"
    | "generated_clip"
    | "final_work"
    | "thumbnail";
  mimeType: string;
  byteSize: number;
  previewUrl?: string;
  previewExpiresAt?: string;
};
```

Storage bucket/key remain server-owned. API responses may include signed preview URLs only when needed for browser display.

## Compatibility Notes

- `script.visualStyle` is the shared style anchor for character, scene, and storyboard images; older restored stories may omit it.
- `script.directorBrief` is stored only in server-side artifact JSON and intentionally omitted from browser-facing story-world and restore responses; storyboard and clip prompt generation read it from persisted artifacts. Older stories may omit it and fall back to defaults.
- `script.qualityChecks[]` may contain deterministic, user-friendly quality summaries for the story-world script. Older data defaults to an empty array.
- Historical multi-core-group or multi-clip data can be restored, but the new MVP creation path creates one core group and one generated clip.
- Placeholder image states are allowed when required upstream asset images are still generating, missing, or unsupported by a provider.
- Downstream artifacts become stale when upstream story-world or storyboard material changes; stale provider packets cannot create new video jobs.
