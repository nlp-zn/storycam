# Local Development

Status: active foundation contract.

## Goal

A new developer should be able to run StoryCam in mock mode in about 10 minutes without AI provider credentials. Supabase is still required because auth, metadata, and private storage are part of the MVP architecture.

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
pnpm storycam:verify:mock
STORYCAM_SEED_USER_ID=<auth.users.id> pnpm storycam:seed
STORYCAM_RUN_SUPABASE_VERIFY=1 pnpm storycam:verify:supabase
```

Planned but not implemented yet:

```bash
pnpm storycam:reset
```

## Required Environment Variables

Create `.env.local` from `.env.example` and keep the mock defaults unless you are intentionally running a real provider smoke test.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=

STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
```

For local UI/E2E smoke without real credentials, the test harness uses mocked HTTP routes. For manual browser testing, use a Supabase local stack or a dedicated Supabase test project, then log in with Google before creating resources.

## Google OAuth Local Setup

Create a Google OAuth web client and add this authorized redirect URI:

```text
http://127.0.0.1:54321/auth/v1/callback
```

Use these authorized JavaScript origins for local browser testing:

```text
http://localhost:3000
http://127.0.0.1:3000
```

Add the client values to your local shell before starting Supabase:

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google-oauth-client-id>
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<google-oauth-client-secret>
supabase stop
supabase start
```

If you keep these values in `.env.local`, load them into the shell first:

```bash
set -a
source .env.local
set +a
supabase start
```

Then start the app with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and open `http://localhost:3000`. StoryCam redirects Google login back to `/auth/callback`, exchanges the OAuth code for a Supabase session, and returns to `/`.

## 10-Minute Mock Flow

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Copy the environment template and fill in Supabase values.

   ```bash
   cp .env.example .env.local
   ```

3. Keep all StoryCam provider values on `mock`.

   ```text
   STORYCAM_GENERATION_MODE=mock
   STORYCAM_TEXT_PROVIDER=mock
   STORYCAM_MULTIMODAL_PROVIDER=mock
   STORYCAM_IMAGE_PROVIDER=mock
   STORYCAM_VIDEO_PROVIDER=mock
   STORYCAM_FINAL_WORK_PROVIDER=mock
   ```

4. Start the app.

   ```bash
   pnpm dev
   ```

5. Open the app, sign in with Google, and run the private story flow:

   ```text
   input idea/photo
     -> confirm story world
     -> generate core storyboard
     -> expand or skip
     -> confirm provider send
     -> generate clip
     -> generate final work
   ```

6. Before committing, run the same default checks used by agents.

   ```bash
   pnpm storycam:verify:mock
   ```

   This command runs lint, typecheck, unit tests, API tests, E2E, visual QA, and a production build with mock provider defaults.

## Optional Seed Data

Use the seed script only against a local or dedicated test Supabase project.

```bash
STORYCAM_SEED_USER_ID=<auth.users.id> pnpm storycam:seed
```

The user id must come from `auth.users`. Seeded data should belong to that user and must not be used to bypass RLS or account-scoped storage checks.

## Supabase Verification

Use this against a local or dedicated test Supabase project after applying migrations.

```bash
STORYCAM_RUN_SUPABASE_VERIFY=1 pnpm storycam:verify:supabase
```

The verification command creates temporary auth users, seeds one user's StoryCam metadata, confirms the owner can read the seeded rows, confirms another user cannot read them, checks private Storage buckets, verifies cross-user Storage access is blocked, and then deletes the temporary users and test object.

For migration idempotency, run the migration flow twice before the verification command:

```bash
supabase db reset
supabase db reset
STORYCAM_RUN_SUPABASE_VERIFY=1 pnpm storycam:verify:supabase
```

If you use a hosted test project instead of Supabase local, apply the migration through your normal Supabase migration workflow, then run the same verification command with that project's anon and service-role keys.

## Real Provider Smoke

Real provider smoke tests are opt-in and secret-gated. See `providers.md` for the provider matrix and required variables.

```text
OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_MULTIMODAL_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2
SEEDANCE_API_KEY=
SEEDANCE_MODEL=doubao-seedance-2-0-260128
```

Run real provider smoke commands only when you explicitly intend to spend provider credits:

```bash
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:openrouter
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:seedance
```

Optional overrides:

```text
OPENROUTER_SMOKE_TEXT_PROMPT=
OPENROUTER_SMOKE_TEXT_TEMPERATURE=0.4
OPENROUTER_SMOKE_IMAGE_PROMPT=
OPENROUTER_SMOKE_IMAGE_ASPECT_RATIO=16:9
OPENROUTER_SMOKE_IMAGE_SIZE=
OPENROUTER_SMOKE_SKIP_IMAGE=1

SEEDANCE_SMOKE_PROMPT=
SEEDANCE_SMOKE_DURATION_SECONDS=5
SEEDANCE_SMOKE_RATIO=16:9
SEEDANCE_SMOKE_POLL_INTERVAL_MS=10000
SEEDANCE_SMOKE_MAX_ATTEMPTS=60
```

Successful smoke output is written to `.temp/storycam-smoke/`. The commands do not print provider media URLs.

## Safety Defaults

- Default mode is mock.
- Real provider smoke tests are opt-in.
- Service role key is server-only.
- Supabase Storage buckets are private.
- No sharing links in Phase 1.

## Active Plan

- `docs/exec-plans/active/storycam-web-mvp-implementation-plan.md`
- `docs/references/providers.md`
- `docs/generated/provider-contract.md`
