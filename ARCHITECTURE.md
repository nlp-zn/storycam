# StoryCam Architecture

This is the top-level map for code and system design. Detailed implementation tasks live in `docs/exec-plans/active/`.

## System Shape

StoryCam is a hosted Web app with server-only AI/provider orchestration.

```text
Browser UI
  -> Next.js App Router pages/components
  -> Next.js Route Handlers / Server Actions
  -> server-only StoryCam services
  -> Supabase Postgres + Supabase Storage
  -> DeepSeek/OpenRouter/Inference.sh provider adapters
  -> Seedance 2.0 video provider
  -> Final work composer
```

## Layer Boundaries

```text
src/app/**              -> routing, page composition, API route boundaries
src/components/**       -> reusable UI components
src/features/storycam/  -> StoryCam domain UI/state/types
src/server/storycam/    -> server-only business services
src/server/db/          -> Supabase clients, repositories, migrations/RPC helpers
src/lib/providers/      -> mock and real AI/media provider adapters
src/lib/jobs/           -> job state machine, idempotency, timeout, cancellation
src/lib/privacy/        -> redaction, hashing, safe logging
supabase/               -> migrations, RLS policies, storage policy setup
tests/ and e2e/         -> unit/API/E2E/visual verification
```

Rules:

- UI never calls AI providers directly.
- API routes validate input and call server-only services.
- Services own business workflows and artifact version checks.
- Repositories own Supabase reads/writes and must scope by `user_id`.
- Provider adapters return normalized success/error shapes.
- Logs and errors must be redacted at boundaries.

## Data Model

Phase 1 uses Supabase Postgres metadata and Supabase Storage media.

Core tables:

- `storycam_sessions`
- `storycam_artifacts`
- `generation_jobs`
- `media_assets`
- `provider_requests`

Private Storage buckets:

- `storycam-uploads`
- `storycam-generated`
- `storycam-mock`

See `docs/generated/db-schema.md` for the current generated schema summary.

Storage access stays private across local, staging, and production. Browser previews use short-lived UI signed URLs. External providers use server-created provider reference signed URLs with a longer TTL, and those URLs must be public HTTPS endpoints from a hosted Supabase project. Local Supabase Storage URLs are valid for mock/local UI work only, not for real Seedance or image-reference provider calls.

## Provider Model

Provider concepts are separate:

- `generation_mode`: `mock` or `real`
- `provider_kind`: `text`, `multimodal`, `image`, `video`, `stitch`
- `provider_name`: `mock`, `openrouter`, `seedance_2_0`, etc.

Story-world text uses a server-only DeepSeek official API adapter with beta strict function calling. Core storyboard text and multimodal providers are orchestrated through Vercel AI SDK with OpenRouter-backed adapters. Story-world asset images can use either the legacy OpenRouter image adapter or the Inference.sh SDK adapter; the current local real-image path is Inference.sh `openai/gpt-image-2`. Video generation uses a dedicated Seedance 2.0 adapter behind `VideoGenerationProvider`.

Story-world text generation must force the DeepSeek strict tool `submit_story_world`, parse only tool call arguments, and validate the final `script`, `characterAssets`, and `sceneAssets` artifact schemas before returning data to the client. Provider draft output may be normalized at the provider boundary, but final artifacts must stay schema-valid. The model never owns server fields such as `id`, `sessionId`, `state`, `version`, or `referenceMediaIds`.

Provider selection is server configuration, not a client parameter. Local mixed mode can run `STORYCAM_GENERATION_MODE=mock` with `STORYCAM_TEXT_PROVIDER=deepseek`; other providers may remain mock. Runtime process environment takes precedence over `.env.local`, so stale exported values can force mock behavior. The story-world API exposes non-secret local diagnostics through `diagnostics.textProvider` and `x-storycam-text-provider`; use these to confirm whether Step 2 is using `mock`, `deepseek`, or `openrouter`.

DeepSeek strict function calling is the recommended story-world path. OpenRouter structured-output reliability is model-specific and remains available for storyboard text and fallback experiments. See `docs/references/providers.md` for current provider and fallback guidance.

## Job Model

Video generation and final work composition are async jobs. Jobs must support:

- idempotency
- polling
- timeout
- cancel/tombstone
- late-result discard
- redacted provider errors

## Main References

- Product spec: `docs/product-specs/storycam-film-machine-design.md`
- Active plan: `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`
- Security: `docs/SECURITY.md`
- Reliability: `docs/RELIABILITY.md`
