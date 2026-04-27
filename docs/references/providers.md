# Provider Modes

Status: active implementation reference.

This document explains how StoryCam chooses mock and real providers during development. The canonical provider interface remains `docs/generated/provider-contract.md`.

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
STORYCAM_TEXT_PROVIDER=openrouter
STORYCAM_MULTIMODAL_PROVIDER=openrouter
STORYCAM_IMAGE_PROVIDER=openrouter
STORYCAM_VIDEO_PROVIDER=seedance_2_0
STORYCAM_FINAL_WORK_PROVIDER=ffmpeg
```

Required secrets and model names:

```text
OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_TEXT_FALLBACK_MODELS=deepseek/deepseek-v4-flash
OPENROUTER_MULTIMODAL_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2

SEEDANCE_API_KEY=
SEEDANCE_MODEL=doubao-seedance-2-0-260128
```

## Provider Matrix

| StoryCam stage | Default | Real path | Notes |
| --- | --- | --- | --- |
| Story world text | mock | OpenRouter text | Uses AI SDK structured JSON output; raw prompts stay server-side. `OPENROUTER_TEXT_FALLBACK_MODELS` can provide a comma-separated fallback chain when the primary model's structured-output endpoint is unavailable. |
| Photo understanding | mock | OpenRouter multimodal | Signed URLs and raw private photos must not appear in logs. |
| Core storyboard image | placeholder/mock | OpenRouter image | Recommended starting model: `openai/gpt-5.4-image-2`. |
| Video clip | mock video | Seedance 2.0 | One clip per confirmed core storyboard group. |
| Final work | mock/FFmpeg fixture | FFmpeg composer | Account-scoped preview only. |

## Safety Rules

- Keep provider keys server-only.
- Do not import real providers from client components.
- Do not log raw private input, full prompts, signed URLs, provider secrets, or unredacted provider errors.
- Store generated media in private Supabase Storage buckets.
- Download Seedance `content.video_url` results before provider URLs expire.
- Treat real smoke output as private account data, not public demo content.

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
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:openrouter
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:seedance
```

The OpenRouter smoke command requires `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`, and `OPENROUTER_IMAGE_MODEL`. It validates a small structured text response and writes one generated storyboard image to `.temp/storycam-smoke/`. Set `OPENROUTER_SMOKE_SKIP_IMAGE=1` to smoke only the text path.

The Seedance smoke command requires `SEEDANCE_API_KEY` and `SEEDANCE_MODEL`. It polls the provider until a terminal task status, downloads the returned video into `.temp/storycam-smoke/`, and does not print the provider video URL.

Other real smoke checks still need dedicated scripts or manual harnesses:

- real clip -> final work smoke

Do not make real smoke required for ordinary PRs until a separate CI secret policy exists.
