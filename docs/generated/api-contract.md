# API Contract Snapshot

Status: implemented snapshot.

Sources: `src/app/api/**/route.ts`, `src/features/storycam/client/storycamApi.ts`, `src/server/storycam/*Service.ts`, and current Playwright/API tests.

## Global Rules

- Real resource routes require Supabase Auth, except app shell and public metadata routes.
- All session, artifact, job, media, and restore responses are scoped to the current `auth.users.id`.
- Route handlers validate input, call server-only services, and return redacted responses.
- Route handlers must not expose prompt packets, raw provider payloads, provider secrets, signed provider-reference URLs, or Supabase service-role keys.
- Media previews use short-lived signed URLs. Restore responses use `Cache-Control: no-store`.
- Unsafe API methods are guarded by same-origin/allowed-origin checks before reaching route handlers.
- Real generation mode enforces account-scoped `首映券` budgets before creating provider jobs. The older per-user daily image/video/final-work quotas remain high safety valves, not the ordinary-user trial boundary.

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
| `GET /api/health` | Public, no-store, lightweight web/config readiness check without secrets. |
| `GET /api/health/deep` | Bearer-token protected deep check for Supabase DB and Storage reachability. |
| `GET /api/auth/me` | Returns anonymous/authenticated account state and lazily issues one automatic 14-day premiere ticket for authenticated users. |
| `POST /api/auth/sign-out` | Signs out and clears local auth bypass opt-out state. |
| `GET /auth/callback` | Exchanges Supabase OAuth callback and returns to StoryCam. |
| `GET /api/storycam-discovery-samples` | Returns short-lived signed URLs for fixed discovery sample posters and MP4s from the private `storycam-generated` bucket; it never returns raw bucket paths. |
| `GET /api/storycam-sessions/current` | Returns current account-scoped active session summary. |
| `GET /api/storycam-sessions/recent` | Returns a bounded list of recent account-scoped sessions for the input screen, capped at 20 restorable projects. |
| `DELETE /api/storycam-sessions/[id]` | Tombstones a user-owned session and cleans associated storage where applicable. |
| `GET /api/storycam-sessions/[id]/restore` | Restores a full account-scoped session snapshot with signed preview URLs. |

Authenticated `/api/auth/me` responses include `premiereTickets: { availableCount,
activeCount }`. The client may display this as a simple `首映券` state, but ticket
reservation and budget enforcement stay server-side.

## Admin Routes

| Route | Purpose |
| --- | --- |
| `GET /api/admin/premiere-tickets?email=...` | `ADMIN_EMAILS`-protected lookup of a user's premiere-ticket balance. |
| `POST /api/admin/premiere-tickets` | Same-origin, `ADMIN_EMAILS`-protected manual issuance of one or more premiere tickets by email; writes an admin audit event. |

Admin ticket routes return only target user id/email and ticket counts. They do not expose
private story text, artifacts, prompts, provider payloads, storage paths, or media URLs.

Restore responses and recent-project summaries may be cached client-side in `sessionStorage` only for the current tab and authenticated user. Restore cache entries are additionally keyed by session id. These caches store JSON and signed URLs, never media bytes, and must preserve absolute URL expiry instead of extending old URLs. Deleting a session clears recent-project cache; selecting any recent project restores it to the story-world review step, regardless of its latest downstream progress.

## Creation And Story Routes

| Route | Purpose |
| --- | --- |
| `POST /api/uploads` | Uploads a user photo into private Storage and links it to a session. |
| `POST /api/story-world` | Creates/updates the story-world script, character assets, and scene asset. In production real mode, starts a durable `story_world` text job and returns `202`. |
| `POST /api/story-world/assets/generate-image` | Starts or polls one story-world asset image job. |
| `POST /api/story-world/assets/generate-images` | Starts or polls batch story-world asset image jobs. |
| `POST /api/storyboard` | Creates the MVP storyboard script, one core group, and the main image prompt. In production real mode, starts a durable `storyboard` text job and returns `202`. |
| `POST /api/storyboard-groups/[id]/expand` | Creates expanded storyboard cards for the selected core group. |

New MVP storyboard creation normalizes to one core group, 15 seconds, and one generated clip target. Older restored data may still contain historical duration/count fields and must be tolerated.

Real text generation for story-world and storyboard is worker-owned after job creation.
Real image and video generation also create a durable job before provider task submission;
the worker owns provider task creation, polling, downloads, and artifact completion.
The browser may poll `GET /api/generation-jobs/[id]` and then restore the session when the
job succeeds, but browser polling is not the production progress engine.

`POST /api/story-world` accepts optional `storyModeId` and `travelDestination`. For `storyModeId: "handdrawn-travel-vlog"`, the request must include exactly one `uploadedPhotoIds[]` entry and a non-empty `travelDestination`; validation failures return redacted `400` errors. The response script may include `storyModeId` so downstream server code can keep image and video prompts in the correct visual route.

In real mode, the first story-world job for a session reserves the earliest available
premiere ticket. Later storyboard, image, clip, and final-work jobs for the same session
reuse that ticket. If no ticket is available or a per-ticket budget is exhausted, routes
return redacted `429` errors with `premiere_ticket_required` or
`premiere_ticket_budget_exceeded`.

In real mode, `POST /api/story-world` also accepts a client-generated
`idempotencyKey`. First-run requests without a `sessionId` must be able to reuse the
same durable job before creating another session, so the key is hashed with the
story-world request payload and provider name.

## Clip And Final Work Routes

| Route | Purpose |
| --- | --- |
| `POST /api/storyboard-groups/[id]/generate-clip` | Creates or resumes a video generation job for the confirmed core group. |
| `GET /api/generation-jobs/[id]` | Polls an account-scoped generation job and returns normalized status/output. |
| `POST /api/generation-jobs/[id]/cancel` | Requests cancellation/tombstone and prevents late provider results from creating outputs. |
| `POST /api/stitch-suggestion` | Produces a user-facing final-work suggestion from confirmed clips. |
| `POST /api/final-work` | Creates or reuses an account-scoped `final_work` generation job and returns `202` with `jobId`, `status`, and `providerName=ffmpeg`. |
| `GET /api/storycam-media/[id]/download` | Streams the current user's final-work MP4 as an attachment; it does not expose storage bucket/key or raw signed URLs. |

The server-created clip prompt packet is internal. The UI may show plain product status such as `720p`, ready/failure states, and retry/retake actions, but must not show provider payloads or professional shot-table data. MP4 export should use the same-origin authenticated download route rather than navigating users to a raw signed Storage URL.

`GET /api/generation-jobs/[id]` is read-only. It returns persisted state, clip previews, or final-work preview metadata for succeeded jobs, but it does not poll providers, compose media, or advance generation. The Render worker is the production progress engine after job creation.

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
- `script.storyModeId` is optional. When set to `handdrawn-travel-vlog`, downstream image and video generation should keep one uploaded-photo-derived hand-drawn traveler character on real travel-location backgrounds.
- `script.directorBrief` is stored only in server-side artifact JSON and intentionally omitted from browser-facing story-world and restore responses; storyboard and clip prompt generation read it from persisted artifacts. Older stories may omit it and fall back to defaults.
- `script.qualityChecks[]` may contain deterministic, user-friendly quality summaries for the story-world script. Older data defaults to an empty array.
- Historical multi-core-group or multi-clip data can be restored, but the new MVP creation path creates one core group and one generated clip.
- Placeholder image states are allowed when required upstream asset images are still generating, missing, or unsupported by a provider.
- Downstream artifacts become stale when upstream story-world or storyboard material changes; stale provider packets cannot create new video jobs.
