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
- optional secret-gated DeepSeek, OpenRouter, Inference.sh, and Seedance smoke tests

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
scripts/check-local.sh
scripts/check-pr.sh
scripts/check-dev.sh
scripts/check-release.sh
STORYCAM_SEED_USER_ID=<auth.users.id> pnpm storycam:seed
STORYCAM_RUN_SUPABASE_VERIFY=1 pnpm storycam:verify:supabase
```

Progressive gates:

- `scripts/check-local.sh`: lint, typecheck, and unit tests. This is the local pre-push gate.
- `scripts/check-pr.sh`: local gate plus production build. GitHub runs this for PRs.
- `scripts/check-dev.sh`: PR gate plus Playwright E2E and visual QA. GitHub runs this after merge to `dev`.
- `scripts/check-release.sh`: dev gate plus mock verification and dependency audit. GitHub runs this after promotion to `main`.
- `scripts/pr-ready.sh`: compatibility alias for `check-pr.sh`; set `PR_READY_E2E=1` to run the dev gate.

## Required Environment Variables

Create `.env.local` from `.env.example` and keep the mock defaults unless you are intentionally running a real provider smoke test.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
STORYCAM_LOCAL_AUTH_BYPASS=0

STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
STORYCAM_PROVIDER_REFERENCE_URL_TTL_SECONDS=3600
```

For local UI/E2E smoke without real credentials, the test harness uses mocked HTTP routes.

To verify only the real text model for Step 2 story-world generation while keeping images, video, and final work on mock providers, use DeepSeek strict tool calling:

```text
STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=deepseek
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock

DEEPSEEK_API_KEY=<your-deepseek-key>
DEEPSEEK_TEXT_MODEL=deepseek-v4-pro
DEEPSEEK_TEXT_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_TEXT_FALLBACK_MODELS=deepseek-v4-flash
```

This mixed mode only changes the server-side text provider behind `/api/story-world`; the client should not send provider names or prompt payloads. Story-world text uses DeepSeek Chat Completions with beta strict function calling and forces the `submit_story_world` tool. The fallback list is optional; it lets the provider try `deepseek-v4-flash` if `deepseek-v4-pro` fails before producing a valid tool call.

StoryCam disables DeepSeek thinking mode for this one strict story-world request. If thinking stays enabled, DeepSeek can route the request as a reasoner-style call and reject the forced `tool_choice`.

If `/api/story-world` returns the same instant fixture, inspect `diagnostics.textProvider` in the JSON response or the response header `x-storycam-text-provider`; `mock` means the running dev server did not start with the DeepSeek text env. Shell-exported variables take precedence over `.env.local`, so clear or override stale values before restarting:

```bash
unset STORYCAM_TEXT_PROVIDER
pnpm dev --port 3000
```

You can also force the value for one run:

```bash
STORYCAM_TEXT_PROVIDER=deepseek pnpm dev --port 3000
```

If `/api/story-world` returns `DEEPSEEK_TOOL_CALL_MISSING`, `DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON`, `DEEPSEEK_STORY_WORLD_INVALID_OUTPUT`, or `DEEPSEEK_TEXT_PROVIDER_FAILED`, check that the model is one that supports DeepSeek strict function calling, that `DEEPSEEK_TEXT_BASE_URL` points to `https://api.deepseek.com/beta`, and that the API key has access to `deepseek-v4-pro`. Restart `pnpm dev` after changing `.env.local`, and use `curl --noproxy '*'` for localhost smoke requests when proxy env vars are present.

Server-side DeepSeek and OpenRouter calls use a proxy-aware fetch wrapper. If your local network requires a proxy, set one of these before starting `pnpm dev`: `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY`. Node's default `fetch` does not automatically honor shell proxy variables, so StoryCam explicitly wires them through `undici.ProxyAgent`.

OpenRouter remains available for core storyboard text and fallback experiments. To test the OpenRouter structured-output path directly:

```text
STORYCAM_TEXT_PROVIDER=openrouter
OPENROUTER_API_KEY=<your-openrouter-key>
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_TEXT_FALLBACK_MODELS=qwen/qwen3.6-flash
```

To generate Step 2 character and scene asset boards from the asset cards, enable the image provider too:

```text
STORYCAM_IMAGE_PROVIDER=inference_sh
INFERENCE_API_KEY=
INFERENCE_IMAGE_APP=openai/gpt-image-2
```

The Inference.sh `openai/gpt-image-2` app also requires the required `OPENAI_KEY` secret to be configured in Inference.sh. StoryCam uses the official `@inferencesh/sdk`, downloads the returned file URI server-side, and stores the image in private StoryCam storage.

To test real Seedance clip generation from the browser:

```text
STORYCAM_GENERATION_MODE=real
STORYCAM_VIDEO_PROVIDER=seedance_2_0
SEEDANCE_API_KEY=<your-seedance-key>
SEEDANCE_MODEL=doubao-seedance-2-0-260128
SEEDANCE_FAST_MODEL=doubao-seedance-2-0-fast-260128
```

Real image-reference testing requires public HTTPS media URLs. If `NEXT_PUBLIC_SUPABASE_URL` points to local Supabase (`localhost`, `127.0.0.1`, or `::1`), StoryCam will create a failed local job or placeholder instead of submitting to Seedance/Inference.sh, because external providers cannot fetch local-only StoryCam images.

Recommended environments:

- `local-mock`: local Supabase plus mock providers; local auth bypass may be enabled.
- `local-real`: local Next.js connected to a hosted Supabase dev/staging project; real provider reference URLs are signed public HTTPS links.
- `staging/prod`: hosted Supabase private buckets plus real providers.

`STORYCAM_PROVIDER_REFERENCE_URL_TTL_SECONDS` controls provider reference signed URLs and defaults to 3600 seconds. UI preview URLs keep the shorter 5 minute TTL.

The browser may cache restored StoryCam JSON payloads, recent-project summaries, and their signed preview URLs in `sessionStorage` for the current tab. These caches are user-bound, expire before the earliest signed URL safety window closes, and are cleared on sign-out, anonymous auth, user switch, restore 401, restore failure, session deletion, or new story creation. Closing the tab discards the cache; no image or video bytes are cached.

For manual browser testing without a Google account, use a Supabase local stack and set:

```text
STORYCAM_LOCAL_AUTH_BYPASS=1
```

This bypass only works outside production and only when `NEXT_PUBLIC_SUPABASE_URL` points to `localhost`, `127.0.0.1`, or `::1`. The server creates or reuses a local Supabase Auth user named `storycam-local-dev@example.test`, so StoryCam metadata still belongs to an `auth.users.id`.
Clicking the in-app sign-out button opts the current browser out of local auth bypass with a session cookie, so logout can still be tested without changing `.env.local`. Clear site cookies or open a fresh browser session to use the bypass user again.

For manual browser testing against a dedicated hosted Supabase dev/staging project, you may opt in to the same dev user without Google login:

```text
STORYCAM_LOCAL_AUTH_BYPASS=1
STORYCAM_LOCAL_AUTH_BYPASS_ALLOWED_SUPABASE_REFS=<your-dev-project-ref>
STORYCAM_LOCAL_AUTH_BYPASS_EMAIL=storycam-local-dev@example.test
```

Hosted bypass still only works outside production, only for `https://<ref>.supabase.co`, and only when `<ref>` is explicitly allowlisted. Do not enable it for production projects.
Change `STORYCAM_LOCAL_AUTH_BYPASS_EMAIL` when you need the browser to reuse an existing dev Auth user and see that user's account-scoped recent projects.

## Google OAuth Local Setup

Create a Google OAuth web client for the Supabase Auth project you are testing against. For the local Supabase CLI stack, add this authorized redirect URI:

```text
http://127.0.0.1:54321/auth/v1/callback
```

For a dedicated hosted Supabase test/staging project, add that project's Supabase Auth callback instead:

```text
https://<test-ref>.supabase.co/auth/v1/callback
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

For local browser testing against a hosted test/staging Supabase project, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to that project, enable Google under Supabase Auth Providers, and add the exact StoryCam callback URL to Supabase Auth URL Configuration:

```text
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

For production, configure the production Supabase project with:

```text
Site URL: https://<production-origin>
Redirect URL: https://<production-origin>/auth/callback
Google authorized JavaScript origin: https://<production-origin>
Google authorized redirect URI: https://<prod-ref>.supabase.co/auth/v1/callback
```

Do not commit Google OAuth client secrets. Keep them in the Supabase dashboard for hosted projects or in local shell environment variables for the Supabase CLI stack.

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

6. Before committing, run the fast local gate.

   ```bash
   scripts/check-local.sh
   ```

7. Before opening a PR, run the PR fast gate when practical.

   ```bash
   scripts/check-pr.sh
   ```

8. For browser/UI flow changes, run the dev gate or targeted Playwright commands.

   ```bash
   PORT=3000 scripts/check-dev.sh
   ```

   `pnpm storycam:verify:mock` remains the heavier mock verification command used by the release gate.

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

Run real provider smoke commands only when you explicitly intend to spend provider credits:

```bash
STORYCAM_RUN_REAL_SMOKE=1 pnpm storycam:smoke:deepseek
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

## Planning References

- `docs/ARCHITECTURE.md`
- `docs/PR_REVIEW.md`
- `docs/references/providers.md`
- `docs/generated/provider-contract.md`
