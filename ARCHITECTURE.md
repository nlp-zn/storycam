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
  -> Vercel AI SDK + OpenRouter providers
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

## Provider Model

Provider concepts are separate:

- `generation_mode`: `mock` or `real`
- `provider_kind`: `text`, `multimodal`, `image`, `video`, `stitch`
- `provider_name`: `mock`, `openrouter`, `seedance_2_0`, etc.

Text, multimodal, and image providers are orchestrated through Vercel AI SDK with OpenRouter-backed adapters. Video generation uses a dedicated Seedance 2.0 adapter behind `VideoGenerationProvider`.

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
