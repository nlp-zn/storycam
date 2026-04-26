# Provider Contract

Status: implemented baseline, sourced from `src/lib/providers/types.ts`.

## Provider Concepts

```ts
type GenerationMode = "mock" | "real";
type ProviderKind = "text" | "multimodal" | "image" | "video" | "stitch";
type ProviderName = "mock" | "openrouter" | "seedance_2_0" | string;
```

Provider identity must keep these concepts separate. Do not use a single enum that mixes stage, provider, and mode.

## Global Rules

- Provider keys are server-only.
- UI never imports provider implementations.
- Providers return normalized success/error shapes.
- Provider errors are redacted before logging or client display.
- Mock providers must be deterministic and must not call external services.
- Real provider smoke tests are opt-in and secret-gated.

## Base Result Shape

```ts
type ProviderSuccess<T> = {
  ok: true;
  providerKind: ProviderKind;
  providerName: ProviderName;
  providerRequestId?: string;
  value: T;
};

type ProviderFailure = {
  ok: false;
  providerKind: ProviderKind;
  providerName: ProviderName;
  providerRequestId?: string;
  errorCode: string;
  redactedError: string;
  retryable: boolean;
  redactionApplied: true;
};
```

## Text Provider

Used for:

- story world generation,
- storyboard script,
- core storyboard groups,
- expanded storyboard cards,
- stitch suggestion.

Real path:

- Vercel AI SDK
- OpenRouter text model

Requirements:

- structured or schema-validated output,
- malformed JSON handling,
- no raw prompt exposure in API responses,
- model name from `OPENROUTER_TEXT_MODEL`.

## Multimodal Provider

Used for:

- uploaded photo understanding,
- extracting stable visual descriptions for people, pets, places, and memory references.

Real path:

- Vercel AI SDK
- OpenRouter multimodal model

Requirements:

- model name from `OPENROUTER_MULTIMODAL_MODEL`,
- uploaded media must belong to current user,
- provider request summary must not include signed URLs.

## Image Provider

Used for:

- core storyboard representative images,
- optionally expanded storyboard card images.

Real path:

- Vercel AI SDK
- OpenRouter image model

Requirements:

- model name from `OPENROUTER_IMAGE_MODEL`,
- output stored in `storycam-generated` bucket,
- failure may degrade to placeholder without blocking video generation.

## Video Provider

Used for:

- generating one clip per confirmed core storyboard group.

Real path:

- Seedance 2.0 behind `VideoGenerationProvider`.

Requirements:

- provider-send confirmation must be true,
- async job only,
- idempotency,
- timeout,
- cancellation/tombstone,
- late-result discard,
- output stored in Supabase Storage.

## Final Work Composer

Used for:

- composing 1-3 clips into final work.

Possible implementation:

- FFmpeg behind `FinalWorkComposer`,
- future replacement with Remotion or cloud media service.

Requirements:

- one clip still produces a new final work artifact,
- output stored in Supabase Storage,
- account-scoped preview only,
- no sharing link in Phase 1.

## Required Environment Variables

```text
STORYCAM_GENERATION_MODE=mock|real
STORYCAM_TEXT_PROVIDER=mock|openrouter
STORYCAM_MULTIMODAL_PROVIDER=mock|openrouter
STORYCAM_IMAGE_PROVIDER=mock|openrouter
STORYCAM_VIDEO_PROVIDER=mock|seedance_2_0
STORYCAM_FINAL_WORK_PROVIDER=mock|ffmpeg

OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=
OPENROUTER_MULTIMODAL_MODEL=
OPENROUTER_IMAGE_MODEL=

SEEDANCE_API_KEY=
```
