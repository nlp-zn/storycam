# Local Development Contract

Status: active foundation contract.

## Goal

A new developer should be able to run StoryCam in mock mode without AI provider credentials. Supabase is still required because auth, metadata, and storage are part of the MVP architecture.

## Expected Stack

- Node.js LTS
- pnpm
- Next.js App Router
- Supabase local dev or a dedicated Supabase test project
- mock AI providers by default
- optional secret-gated OpenRouter and Seedance smoke tests

## Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
```

Planned but not implemented yet:

```bash
pnpm storycam:seed
pnpm storycam:reset
```

## Required Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
```

Optional real provider smoke variables:

```text
OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=
OPENROUTER_MULTIMODAL_MODEL=
OPENROUTER_IMAGE_MODEL=
SEEDANCE_API_KEY=
```

## Safety Defaults

- Default mode is mock.
- Real provider smoke tests are opt-in.
- Service role key is server-only.
- Supabase Storage buckets are private.
- No sharing links in Phase 1.

## Active Plan

- `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`
