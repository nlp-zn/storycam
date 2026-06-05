# StoryCam Architecture

This is the top-level map for current code and system design. Product behavior lives in `docs/product-specs/`; quality gates live in `docs/PR_REVIEW.md`.

## System Shape

StoryCam is a hosted web app with server-only AI/provider orchestration.

```text
Browser UI
  -> Next.js App Router pages and route handlers
  -> StoryCam React workspace components
  -> server-only StoryCam services
  -> Supabase Auth + Postgres + private Storage
  -> DeepSeek / OpenRouter / Inference.sh / Seedance provider adapters
  -> final work composition boundary
```

## Layer Boundaries

```text
src/app/**              -> app shell, route handlers, auth callback, robots/sitemap
src/components/ui/**    -> local shadcn-style primitives
src/components/storycam -> StoryCam flow surfaces and composition wrappers
src/features/storycam/  -> client API/state/types for the StoryCam flow
src/server/storycam/    -> server-only business services and repositories
src/server/db/**        -> Supabase clients, typed DB helpers, storage policy tests
src/server/ai/**        -> provider HTTP/proxy and Vercel AI helpers
src/lib/providers/**    -> provider result types and provider error normalization
src/lib/privacy/**      -> redaction helpers
supabase/migrations/**  -> schema, RLS, storage, and account-scoped reference migrations
tests/**                -> API, script, E2E, and visual verification
```

Rules:

- UI never imports real providers or calls AI providers directly.
- API routes validate input, require the current user where needed, and call server-only services.
- Services own workflow state, artifact version checks, idempotency, and late-result discard.
- Repositories own Supabase reads/writes and must scope by `user_id`.
- Provider adapters return normalized success/error shapes.
- Logs and user-facing errors must be redacted at boundaries.

## Main Runtime Surfaces

Current API route handlers:

- Auth/session: `/api/auth/me`, `/api/auth/sign-out`, `/auth/callback`.
- Story creation: `/api/uploads`, `/api/story-world`, `/api/storyboard`, `/api/storyboard-groups/[id]/expand`.
- Media generation: `/api/story-world/assets/generate-image`, `/api/story-world/assets/generate-images`, `/api/storyboard-groups/[id]/frames/[frameNumber]/regenerate-image`, `/api/storyboard-groups/[id]/generate-clip`.
- Jobs and outputs: `/api/generation-jobs/[id]`, `/api/generation-jobs/[id]/cancel`, `/api/stitch-suggestion`, `/api/final-work`, `/api/storycam-media/[id]/download`.
- Session restore and recent projects: `/api/storycam-sessions/current`, `/api/storycam-sessions/recent`, `/api/storycam-sessions/[id]`, `/api/storycam-sessions/[id]/restore`.

Client flow lives under `/storycam/[[...step]]` and renders the creation workspace for input, story world, core storyboard, expansion, clip generation, and final work states.

## Data And Media Model

Phase 1 uses Supabase Postgres metadata and private Supabase Storage media.

Core tables:

- `storycam_sessions`
- `storycam_artifacts`
- `generation_jobs`
- `storycam_premiere_tickets`
- `admin_audit_events`
- `media_assets`
- `provider_requests`

Private Storage buckets:

- `storycam-uploads`
- `storycam-generated`
- `storycam-mock`

Storage access stays private across local, staging, and production. Browser previews use short-lived UI signed URLs. Final MP4 export uses an authenticated same-origin download route so the browser receives an attachment response instead of navigating to a raw signed URL. External providers use server-created provider reference signed URLs with a separate TTL; those URLs must be public HTTPS endpoints from a hosted Supabase project. Local Supabase Storage URLs are valid for mock/local UI work only, not for real Seedance or reference-image provider calls.

Restore responses are account-scoped, `Cache-Control: no-store`, and may be cached in browser `sessionStorage` only for the current tab/user/session. Recent-project summaries may use the same current-tab, user-bound cache so the input screen can render immediately while a background refresh runs. The recent-project endpoint returns a bounded view, currently up to 20 restorable sessions; deleting from the drawer uses the same session deletion route and clears recent-project cache. These caches store JSON payloads and signed URLs, never media bytes, and must clear on sign-out, anonymous auth, user switch, restore 401, restore failure, session deletion, or new story creation.

See `docs/generated/db-schema.md` and `docs/generated/api-contract.md` for implementation snapshots.

Real beta access uses account-scoped `首映券` records. A ticket binds to one session,
generation jobs created for that session store `premiere_ticket_id`, and admin manual
issuance goes through `issue_storycam_premiere_tickets` so the ticket batch and
`admin_audit_events` row commit atomically.

## Provider Model

Provider concepts are separate:

- `generation_mode`: `mock` or `real`
- `provider_kind`: `text`, `multimodal`, `image`, `video`, `stitch`
- `provider_name`: `mock`, `deepseek`, `openrouter`, `inference_sh`, `seedance_2_0`, `seedance_2_0_fast`, etc.

Provider selection is server configuration, not a client parameter.

- Story-world text uses DeepSeek official beta strict function calling. It forces the `submit_story_world` tool, parses only tool-call arguments, and validates the final StoryCam artifacts before saving them.
- Core storyboard text and fallback structured text use OpenRouter-backed Vercel AI SDK adapters. In production real mode, story-world and core-storyboard text run as durable `generation_jobs` so Cloudflare/browser HTTP timeouts do not own progress.
- Story-world, core storyboard, and expanded storyboard images prefer Inference.sh `openai/gpt-image-2`; OpenRouter image remains a legacy adapter behind the same boundary. Real image task submission and polling are worker-owned.
- Video generation uses Seedance 2.0 / Seedance 2.0 Fast behind `VideoGenerationProvider`. Real video task submission and polling are worker-owned.
- Final work uses the final-work provider/composer boundary and remains account-scoped.

Local mixed mode can run `STORYCAM_GENERATION_MODE=mock` with `STORYCAM_STORY_WORLD_TEXT_PROVIDER=deepseek`; other providers may remain mock. `STORYCAM_TEXT_PROVIDER` remains a compatibility fallback. Runtime process env takes precedence over `.env.local`.

See `docs/references/providers.md` and `docs/generated/provider-contract.md`.

## Job Model

Async work uses `generation_jobs` plus service-owned polling, cancellation, timeout, tombstone, and late-result discard.

Job-backed surfaces include:

- real story-world text generation,
- real core storyboard text generation,
- story-world asset image generation,
- storyboard image generation,
- expanded storyboard image generation,
- Seedance video clip generation,
- final work composition.

Jobs must never mutate terminal failed/canceled/expired records into success. Retry creates a new attempt or job according to service policy. Running jobs for deleted sessions are tombstoned and late provider results are discarded. Production progress is owned by `storycam-worker`, which claims rows with `locked_by`, `locked_at`, and `run_after`; browser polling is read-only.

See `docs/generated/job-lifecycle.md`.

## UI Foundation

StoryCam uses local shadcn-style primitives under `src/components/ui` and StoryCam composition wrappers under `src/components/storycam/StoryCamPrimitives.tsx`. The visual identity is dark grid, cinematic glass, neon cyan/pink accents, compact workbench controls, lucide action icons, and visible loading/error/retry/cancel/success states.

The current visual source of truth is `docs/design-docs/stitch_storycam_cinematic_workstation/` plus the update images listed in `docs/design-docs/index.md`.

## Quality Gates

Quality checks are progressive:

- Local pre-push: `scripts/check-local.sh`.
- PR fast gate: `scripts/check-pr.sh`.
- Dev integration gate: `scripts/check-dev.sh`.
- Main release gate: `scripts/check-release.sh`.

Codex AI review is never automatic. Use `docs/PR_REVIEW.md` when the user asks for PR Gate or Ship Gate.

## Main References

- Product specs: `docs/product-specs/`
- Frontend and design: `docs/FRONTEND.md`, `docs/DESIGN.md`, `docs/design-docs/`
- Security: `docs/SECURITY.md`
- Reliability: `docs/RELIABILITY.md`
- Local development: `docs/references/local-dev.md`
- Provider modes: `docs/references/providers.md`
