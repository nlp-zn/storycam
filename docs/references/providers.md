# Provider Modes

Status: active implementation reference.

This document explains how StoryCam chooses mock and real providers during development. The canonical provider interface remains `docs/generated/provider-contract.md`.

For Inference.sh SDK, CLI, task status, and async image rules, see `docs/references/inference-sh.md`.

## Defaults

StoryCam defaults to mock mode. Mock mode must be deterministic, account-scoped, and free of external AI calls.

```text
STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
```

Use this mode for normal local development, CI, E2E, and visual QA.

## Real Provider Smoke Is Opt-In

Real provider smoke tests are never part of the default local flow. They require explicit environment variables and should run only from a developer machine or a secret-enabled CI job.

```text
STORYCAM_GENERATION_MODE=real
STORYCAM_TEXT_PROVIDER=deepseek
STORYCAM_MULTIMODAL_PROVIDER=openrouter
STORYCAM_IMAGE_PROVIDER=inference_sh
STORYCAM_VIDEO_PROVIDER=seedance_2_0
STORYCAM_FINAL_WORK_PROVIDER=ffmpeg
```

Required secrets and model names:

```text
DEEPSEEK_API_KEY=
DEEPSEEK_TEXT_MODEL=deepseek-v4-pro
DEEPSEEK_TEXT_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_TEXT_FALLBACK_MODELS=deepseek-v4-flash

OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_TEXT_FALLBACK_MODELS=qwen/qwen3.6-flash
OPENROUTER_MULTIMODAL_MODEL=deepseek/deepseek-v4-pro

INFERENCE_API_KEY=
INFERENCE_IMAGE_APP=openai/gpt-image-2

SEEDANCE_API_KEY=
SEEDANCE_MODEL=doubao-seedance-2-0-260128
```

## Provider Matrix

| StoryCam stage | Default | Real path | Notes |
| --- | --- | --- | --- |
| Story world text | mock | DeepSeek official strict tool calling | Uses `deepseek-v4-pro` through `/beta` Chat Completions, forces `submit_story_world`, parses tool arguments, and validates normalized StoryCam artifacts. StoryCam normalizes the visual route to private comic-film / animated-storyboard style, not photorealistic real-person drama. Raw prompts stay server-side. |
| Core storyboard text | mock | OpenRouter text | MVP creation uses confirmed script, character assets, and scene asset to create one 9-frame storyboard script, one core group, and one main-image prompt from frame 01. The group targets about 15 seconds. Image prompts should describe stylized comic animation storyboard frames with fictional illustrated characters. |
| Photo understanding | mock | OpenRouter multimodal | Signed URLs and raw private photos must not appear in logs. |
| Story-world asset image | placeholder/mock | Inference.sh app | Uses the official `@inferencesh/sdk` with `INFERENCE_IMAGE_APP=openai/gpt-image-2`; production routes submit async tasks with `wait:false`, poll `generation_jobs`, then download completed output server-side into private StoryCam storage. The app requires an Inference.sh API key and its required `OPENAI_KEY` secret configured in Inference.sh. Character boards should be comic-animation model sheets, not real-person likeness boards. |
| Core/expanded storyboard image | placeholder/mock | Inference.sh `openai/gpt-image-2` | Storyboard images use ready character and scene asset images as `images[]` visual references plus the stored frame prompt. Pure-prompt providers return placeholders instead of generating off-text. The default target is stylized comic animation with consistent fictional illustrated characters. |
| Video clip | mock video | Seedance 2.0 | MVP creation generates one clip for the confirmed core storyboard group. The server creates a 9-frame clip prompt packet with native audio direction, submits a Seedance task with comic storyboard image references and `generate_audio: true`, polls by provider task id or receives a webhook update, then downloads `content.video_url` into private storage. Reference media URLs sent to Seedance must be public HTTPS URLs, not local Supabase signed URLs. |
| Final work | mock/FFmpeg fixture | FFmpeg composer | Account-scoped preview only. |

## DeepSeek Strict Tool Story World

Story-world text generation should use DeepSeek's official beta strict function calling path instead of OpenRouter structured output. Configure:

```text
STORYCAM_TEXT_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_TEXT_MODEL=deepseek-v4-pro
DEEPSEEK_TEXT_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_TEXT_FALLBACK_MODELS=deepseek-v4-flash
```

The provider calls Chat Completions with one strict tool:

```json
{
  "tool_choice": {
    "type": "function",
    "function": { "name": "submit_story_world" }
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "submit_story_world",
        "strict": true
      }
    }
  ]
}
```

Only `choices[0].message.tool_calls[*].function.arguments` is accepted as model output. The arguments must parse as JSON and pass the DeepSeek draft schema. StoryCam then normalizes the draft into final `script`, `characterAssets`, and `sceneAssets` artifacts and adds server-owned fields such as `id`, `sessionId`, `state`, `version`, and `referenceMediaIds`.

Story-world output policy:

- `script.summary` and `script.beats` are script-level story material only. Beats are narrative events or story paragraphs, not shot lists, storyboard rows, camera moves, framing notes, edits, or shot numbers. Core storyboard generation is the first stage that may derive shot groups from the confirmed script.
- `characterAssets` contains only main or key counterpart characters, 1-3 total.
- `sceneAssets` contains exactly 1 scene. The single scene includes 4-6 `scenePanels` for the multi-panel environment asset image.
- `script.visualStyle` is the shared style anchor for both character and scene asset images; infer it from the user story instead of hard-coding manga, animation, or live-action.
- The scene image provider prompt renders those panels as one environment-only reference board, not multiple scene assets. It must not render people, human silhouettes, body parts, crowds, or human reflections inside scene assets.

`deepseek-v4-pro` defaults to thinking mode. StoryCam sends `thinking: { "type": "disabled" }` for the story-world strict tool call because this endpoint must return exactly one forced function call. Keep the DeepSeek strict tool JSON Schema inside the documented supported subset; in particular, do not use array `minItems` or `maxItems` in the provider request schema. Enforce array counts in the server-side zod validation layer instead.

Diagnostic provider error codes:

- `DEEPSEEK_TOOL_CALL_MISSING`: the model did not call `submit_story_world`.
- `DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON`: tool arguments were not valid JSON.
- `DEEPSEEK_STORY_WORLD_INVALID_OUTPUT`: arguments failed the provider draft schema or final artifact schema.
- `DEEPSEEK_TEXT_PROVIDER_FAILED`: DeepSeek returned a network, timeout, auth, or upstream error.

DeepSeek calls reuse the same proxy-aware server fetch behavior as OpenRouter. If your local network requires a proxy, set `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY` before starting `pnpm dev`.

## OpenRouter Structured Output Notes

OpenRouter remains available for core storyboard text and as a non-default story-world fallback. For AI SDK 6 structured output, prefer `generateText({ output: Output.object({ schema, name, description }) })` over the deprecated `generateObject` call. OpenRouter maps this to `response_format` with JSON schema. The OpenRouter model should be wrapped with `extractJsonMiddleware()`, the OpenRouter `response-healing` plugin, and `provider.require_parameters=true` so requests route only to providers that support the required structured-output parameters.

Do not rely on a model being equally reliable for plain chat and structured JSON. On April 27, 2026, OpenRouter's model list showed `deepseek/deepseek-v4-pro` supporting `response_format` but not `structured_outputs`; it could answer plain text while structured-output calls returned provider `502` or timed out. If using OpenRouter for local structured-output testing, prefer `OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-flash` and `OPENROUTER_TEXT_FALLBACK_MODELS=qwen/qwen3.6-flash`, because both advertised `structured_outputs` at that time.

Provider draft schemas should be tolerant at the provider boundary and strict at the StoryCam artifact boundary. The final artifacts must always validate against StoryCam artifact schemas before reaching the client.

When reproducing local API behavior with `curl`, use `--noproxy '*'` for localhost if your shell has proxy env vars. Otherwise the request can be routed through a system proxy and return an empty `502`, which looks like a StoryCam/API failure but never reached the Next.js route.

When `/api/story-world` appears to return the same mock fixture instantly, check `diagnostics.textProvider` or `x-storycam-text-provider`. If it is `mock` while `.env.local` says `STORYCAM_TEXT_PROVIDER=deepseek`, the dev shell likely exported `STORYCAM_TEXT_PROVIDER=mock`; process env wins over `.env.local`.

## Safety Rules

- Keep provider keys server-only.
- Do not import real providers from client components.
- Do not log raw private input, full prompts, signed URLs, provider secrets, or unredacted provider errors.
- Store generated media in private Supabase Storage buckets.
- Download Seedance `content.video_url` results before provider URLs expire.
- Treat real smoke output as private account data, not public demo content.

## Seedance Video Communication

Seedance video generation is asynchronous. The provider contract is:

1. `POST /contents/generations/tasks` creates the remote task and returns a provider task id.
2. `GET /contents/generations/tasks/{id}` reads task status until `succeeded`, `failed`, `canceled`, or `expired`; official examples use about a 30 second polling interval.
3. `callback_url` may be supplied when a public server endpoint can receive webhook notifications; the webhook body matches the task query response shape.
4. When the task succeeds, StoryCam must download `content.video_url` into private storage before the provider URL expires.

The browser should never poll Seedance directly. StoryCam should create or update a local `generation_jobs` row, store the provider task id when submission succeeds, and let the client poll StoryCam with slow backoff. Production can replace client polling with a webhook-updated job plus SSE or realtime updates, but the provider-facing communication remains server-side.

StoryCam clip generation enables Seedance native audio by default with `generate_audio: true`. The provider prompt packet must include audio direction that follows the confirmed storyboard script and reference frames: rain ambience, store-door chime, footsteps or fabric movement, restrained background music, and sparse dialogue/inner voice only when it supports the visual beat. The generated `content.video_url` is still the single mp4 result and should be downloaded to private storage before expiry.

StoryCam supports two product-facing Seedance variants: `seedance_2_0` (`SEEDANCE_MODEL`, default `doubao-seedance-2-0-260128`) and `seedance_2_0_fast` (`SEEDANCE_FAST_MODEL`, default `doubao-seedance-2-0-fast-260128`). Both variants support the StoryCam-exposed `16:9` and `9:16` output ratios. Store the selected variant in `generation_jobs.provider_name` and use it to choose the provider while polling.

StoryCam sends `resolution: "720p"` explicitly for the v1 cost profile. The current Volcengine AI experience for `Doubao-Seedance-2.0 260128` shows `1080p` as the selected UI default, but StoryCam keeps the lower-cost 720p setting until the product has an explicit quality/cost control. UI may show this as the product-facing output spec `720p`; do not expose the full provider payload.

Seedance must be able to fetch every referenced image/video/audio URL. StoryCam signs provider reference media with `STORYCAM_PROVIDER_REFERENCE_URL_TTL_SECONDS` (default 3600 seconds) instead of the UI preview TTL. Local Supabase Storage URLs such as `localhost`, `127.0.0.1`, or `::1` are rejected before provider submission and recorded as failed local jobs. For real image-reference testing from local development, run local Next.js against a hosted Supabase dev/staging project so the signed Storage URLs are public HTTPS.

The v1 Seedance route should avoid sending photorealistic real-person or real-person-like face references from external Storage URLs. Default StoryCam assets and storyboard frames should be comic-film / animated-storyboard references. Real-person, virtual-human, or authorized likeness routes require an explicit Ark/ByteDance asset workflow such as `asset://...` and should be treated as a later provider capability.

The same provider reference URL rule applies to reference-image providers such as Inference.sh. If StoryCam cannot create a public HTTPS reference URL for a character or scene image, it returns a placeholder instead of submitting a provider task.

## Verification

Default mock verification:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
```

Real smoke verification is intentionally manual and secret-gated:

```bash
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:deepseek
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:openrouter
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:seedance
```

The DeepSeek smoke command requires `DEEPSEEK_API_KEY` and defaults to `DEEPSEEK_TEXT_MODEL=deepseek-v4-pro`. It prints only provider/model/title/count metadata, not the full prompt, private input, or provider response.

The OpenRouter smoke command requires `OPENROUTER_API_KEY` and `OPENROUTER_TEXT_MODEL`. Its legacy image path also requires `OPENROUTER_IMAGE_MODEL`; set `OPENROUTER_SMOKE_SKIP_IMAGE=1` when only validating the text path. Inference.sh image smoke is currently manual through the story-world asset image endpoint with `STORYCAM_IMAGE_PROVIDER=inference_sh`, `INFERENCE_API_KEY`, and `INFERENCE_IMAGE_APP`.

The Seedance smoke command requires `SEEDANCE_API_KEY` and `SEEDANCE_MODEL`. It polls the provider until a terminal task status, downloads the returned video into `.temp/storycam-smoke/`, and does not print the provider video URL.

Other real smoke checks still need dedicated scripts or manual harnesses:

- real clip -> final work smoke

Do not make real smoke required for ordinary PRs until a separate CI secret policy exists.
