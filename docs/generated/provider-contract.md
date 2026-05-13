# Provider Contract

Status: implemented snapshot.

Sources: `src/lib/providers/types.ts`, `src/server/config.ts`, provider factories in `src/server/storycam/`, and `docs/references/providers.md`.

## Provider Concepts

```ts
type GenerationMode = "mock" | "real";
type ProviderKind = "text" | "multimodal" | "image" | "video" | "stitch";
type ProviderName = "mock" | "deepseek" | "openrouter" | "inference_sh" | "seedance_2_0" | "seedance_2_0_fast" | string;
```

Provider identity must keep these concepts separate. Do not use a single enum that mixes stage, provider, and mode.

## Global Rules

- Provider keys are server-only.
- UI never imports provider implementations.
- Providers return normalized success/error shapes.
- Provider errors are redacted before logging or client display.
- Mock providers must be deterministic and must not call external services.
- Real provider smoke tests are opt-in and secret-gated; default local and CI gates use mock providers.

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
- per-group storyboard scripts,
- the MVP's single core storyboard group at about 15 seconds,
- expanded storyboard card text for the 9-image canvas,
- stitch suggestion.

Current real paths:

- Story world: DeepSeek official Chat Completions strict function calling,
- Core storyboard and other structured text: Vercel AI SDK with OpenRouter text model.

Requirements:

- structured or schema-validated output,
- malformed JSON handling,
- no raw prompt exposure in API responses,
- story world primary model name from `DEEPSEEK_TEXT_MODEL`, recommended `deepseek-v4-pro`,
- story world strict tool name `submit_story_world` with forced `tool_choice`,
- story world optional comma-separated fallback chain from `DEEPSEEK_TEXT_FALLBACK_MODELS`,
- story world model output must be parsed only from tool call `function.arguments`,
- server normalizes and owns `id`, `sessionId`, `state`, `version`, and `referenceMediaIds`,
- `handdrawn-travel-vlog` story-world input carries `storyModeId`, one uploaded photo id, and `travelDestination`; providers must produce one hand-drawn traveler character asset plus one real-destination route scene asset, and server normalization persists `script.storyModeId`,
- core storyboard primary model name from `OPENROUTER_TEXT_MODEL`,
- core storyboard optional comma-separated fallback chain from `OPENROUTER_TEXT_FALLBACK_MODELS`,
- `/api/storyboard` creates one script and main-image prompt per core group.
- storyboard scripts are adapted from confirmed script, character assets, and scene assets; they must not invent new people, locations, wardrobes, props, or spatial rules outside the story world.
- core storyboard titles, summaries, frame descriptions, scene notes, and audio cues are ordinary-user-facing text and must be Simplified Chinese; only internal storyboard `imagePrompt` fields may stay English for image generation.
- core storyboard scripts must apply internal Shanyin-style shot connection logic: adjacent frames should not repeat the same shot size or neighboring shot-size scale without a narrative reason; scene-heavy/travel frames should vary establishing, action, reaction, detail, and empty-frame beats through cross-scale shot-size and viewpoint contrast.

## Multimodal Provider

Used for:

- uploaded photo understanding,
- extracting stable visual descriptions for people, pets, places, and memory references.

Current real path:

- Vercel AI SDK
- OpenRouter multimodal model

Requirements:

- model name from `OPENROUTER_MULTIMODAL_MODEL`,
- uploaded media must belong to current user,
- provider request summary must not include signed URLs.
- recommended starting model: `deepseek/deepseek-v4-pro`.

## Image Provider

Used for:

- story-world character and scene asset boards,
- core storyboard representative images,
- expanded storyboard card images.

Real path:

- Inference.sh SDK app provider for current story-world asset boards and reference-image storyboard frames,
- legacy OpenRouter image adapter remains available behind the same provider boundary.

Requirements:

- `INFERENCE_API_KEY` and `INFERENCE_IMAGE_APP=openai/gpt-image-2` for Inference.sh,
- the Inference.sh app's required `OPENAI_KEY` secret must be configured in Inference.sh,
- model name from `OPENROUTER_IMAGE_MODEL` for the legacy OpenRouter path,
- output stored in private StoryCam Storage,
- story-world character and scene asset images must inherit the session `video_aspect_ratio`; `9:16` sessions use vertical portrait image task dimensions and prompt guidance for scene boards,
- handdrawn travel character asset images send the project-owned hand-drawn character style plate as Image 1 and may send the uploaded user photo as Image 2; prompts use Image 1 for style and Image 2 only for hair, glasses, clothing silhouette, posture, and travel mood, never for a photorealistic likeness,
- handdrawn travel scene asset images must stay photographic, real-world, and destination-specific; the shared hand-drawn style applies to the traveler character, not to the travel background,
- representative images are stored as `thumbnail` media linked to the core storyboard group,
- expanded storyboard images are stored as `thumbnail` media linked to their expanded card artifact,
- storyboard images must use ready story-world character and scene asset images as Inference.sh `images[]` reference inputs plus the frame prompt; pure text fallback is not allowed for storyboard images,
- expanded storyboard image jobs should append the ready core storyboard thumbnail as a `core_storyboard` continuity reference when available, and must preserve fixed scene anchors such as doors, wall cracks, plants/flowers, windows, landmarks, and left/right relationships instead of relocating them between frames,
- in `handdrawn-travel-vlog`, storyboard images must keep scene references as real travel-location photography while compositing only the confirmed traveler as a 2D hand-drawn illustrated character; do not apply the generic all-comic storyboard style to the travel background,
- providers that do not explicitly support reference images must return placeholders with `reference_images_unsupported`,
- missing character or scene asset thumbnails return placeholders with `waiting_for_asset_images`,
- failure may degrade to placeholder without blocking video generation.
- recommended story-world asset app: `openai/gpt-image-2`.

## Video Provider

Used for:

- generating one clip per confirmed core storyboard group.

Real path:

- Seedance 2.0 / Seedance 2.0 Fast behind `VideoGenerationProvider`.

Requirements:

- provider-send confirmation must be true,
- async job only,
- `clip_prompt_packet` must include the 9-frame storyboard summary, target duration, output aspect ratio, resolution, and any ready core/expanded storyboard image media references,
- Seedance input uses the packet provider prompt plus signed storyboard image URLs as `image_url` content items,
- idempotency,
- timeout,
- cancellation/tombstone,
- late-result discard,
- model name from `SEEDANCE_MODEL` or `SEEDANCE_FAST_MODEL`, selected by `generation_jobs.provider_name`; selected Fast requests must not be silently downgraded to regular `seedance_2_0`, and Fast submission failures stay recorded against `seedance_2_0_fast`,
- create tasks with `POST /contents/generations/tasks`,
- poll or normalize webhook payloads from `GET /contents/generations/tasks/{id}`,
- terminal success returns `content.video_url`, which must be downloaded before the provider URL expires,
- provider video downloads must enforce timeout, MIME, and generated-media size limits before writing to Storage,
- output stored in Supabase Storage.

## Final Work Composer

Used for:

- composing the confirmed clip into the final work. Historical multi-clip data may still be restored, but the MVP creation path generates one clip.

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
STORYCAM_TEXT_PROVIDER=mock|openrouter|deepseek
STORYCAM_MULTIMODAL_PROVIDER=mock|openrouter
STORYCAM_IMAGE_PROVIDER=mock|openrouter|inference_sh
STORYCAM_VIDEO_PROVIDER=mock|seedance_2_0
STORYCAM_FINAL_WORK_PROVIDER=mock|ffmpeg

DEEPSEEK_API_KEY=
DEEPSEEK_TEXT_MODEL=deepseek-v4-pro
DEEPSEEK_TEXT_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_TEXT_FALLBACK_MODELS=deepseek-v4-flash

OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_TEXT_FALLBACK_MODELS=qwen/qwen3.6-flash
OPENROUTER_MULTIMODAL_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2
INFERENCE_API_KEY=
INFERENCE_IMAGE_APP=openai/gpt-image-2

SEEDANCE_API_KEY=
SEEDANCE_MODEL=doubao-seedance-2-0-260128
SEEDANCE_FAST_MODEL=doubao-seedance-2-0-fast-260128
```
