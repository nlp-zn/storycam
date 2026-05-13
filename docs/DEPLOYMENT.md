# StoryCam Deployment Plan

Status: planning baseline. This document records the current production deployment
direction and the gaps to close before launch. It is not an implemented platform
configuration yet.

## Goals

- Serve first users in mainland China and overseas through a Cloudflare-managed domain.
- Keep Google as the only initial auth provider.
- Run the app close to the existing Supabase Singapore project.
- Let generation continue and save results after the user closes the browser tab.
- Produce a real final MP4 artifact in production, not a mock or preview-only result.
- Keep provider calls, service-role Supabase access, prompt packets, signed URLs, and raw
  provider payloads server-side.

## Non-Goals

- Do not split the MVP frontend to Vercel and backend to Render.
- Do not add non-Google auth for the first launch.
- Do not expose public sharing, a marketplace, payments, or professional shot-table
  controls as part of the first deployment.
- Do not let the browser call model, image, or video providers directly.

## Recommended Topology

Use Render as the full-stack runtime and Supabase as the managed backend services.
Cloudflare should sit in front of the public domain.

```mermaid
flowchart LR
  user["Users in mainland China and overseas"] --> cf["Cloudflare domain, TLS, WAF, rate limits"]
  cf --> web["Render Singapore: storycam-web, Next.js UI + API"]
  web --> sb["Supabase Singapore: Auth, Postgres, private Storage"]
  web --> providers["Server-side AI and media providers"]
  worker["Render Singapore: storycam-worker"] --> sb
  worker --> providers
  worker --> ffmpeg["ffmpeg final MP4 composition"]
  sentry["Sentry"] <-. errors .- web
  sentry <-. errors .- worker
  posthog["PostHog"] <-. safe product events .- web
```

## Platform Decision

Deploy `storycam-web` and `storycam-worker` on Render in Singapore.

Render currently lists Singapore as an available service region, and Render regions are
selected when a service is created. Render does not currently support moving an existing
service to another region, so create the first staging and production services in
Singapore. Supabase also supports Singapore (`ap-southeast-1`), which keeps database and
storage round trips close to the app runtime.

Render's native runtime docs list Node.js, pnpm, and ffmpeg in the deploy environment.
That is enough for the first deployment if the service can run ffmpeg successfully at
runtime. If runtime ffmpeg behavior differs from the docs or the app needs stricter media
tooling, move the services to Docker and install/pin ffmpeg explicitly.

## Why Not Vercel Frontend Plus Render Backend

StoryCam is a Next.js App Router full-stack app. The UI, API routes, auth callback,
server-side Supabase session handling, provider orchestration, artifact writes, and final
work generation are part of one product boundary.

Splitting the UI to Vercel and the API to Render would add cross-origin cookie, CORS,
OAuth redirect, CSRF, and media URL complexity without solving the most important launch
requirement: durable background generation. Keep a same-origin Render web service for the
MVP. Vercel can be reconsidered later for a static marketing site or preview environment,
not for the core authenticated app.

## Supabase Boundary

Supabase is part of the backend platform, but it is not the whole StoryCam backend.

- Supabase owns Auth, Postgres, private Storage, RLS, backups, and signed object access.
- StoryCam server code owns product workflow, provider orchestration, generation jobs,
  final MP4 composition, admin actions, redaction, and quota enforcement.
- The browser may use the Supabase anon/public key where the current app requires it, but
  it must never receive service-role keys, provider keys, prompt packets, raw provider
  payloads, or privileged storage paths.

For frontend API authentication, keep same-origin cookie/session-based requests. Supabase
JWTs are still the identity primitive, but the browser should not manually manage Bearer
tokens in localStorage for StoryCam API calls. Server routes should continue to resolve the
user through the Supabase SSR session, enforce ownership on every request, and add Origin
or CSRF checks for unsafe methods before production.

## Services

### storycam-web

Render type: Web Service.

Region: Singapore.

Responsibilities:

- Serve the Next.js UI.
- Handle `/api/*` routes.
- Handle Supabase auth callbacks.
- Create and read user-scoped sessions, assets, storyboard groups, generation jobs, and
  final work records.
- Return only redacted errors and account-scoped artifact metadata to the browser.

Current deployment gap: `package.json` has `build` but no `start` script. Render can use a
Start Command such as `pnpm exec next start` for the first deploy, or the project can add a
`start` script later.

Expected commands:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm exec next start
```

### storycam-worker

Render type: Background Worker.

Region: Singapore.

Responsibilities:

- Advance generation jobs independently from browser polling.
- Claim queued/running jobs with a durable lock so multiple workers do not process the same
  job.
- Poll or resume async provider tasks for image and video generation.
- Download provider outputs before provider URLs expire.
- Store generated media in private Supabase Storage.
- Write generated clip and final work artifact rows.
- Run ffmpeg to compose the real final MP4.
- Mark jobs succeeded, failed, canceled, or tombstoned with redacted diagnostics.
- Retry transient provider failures within configured limits.

Launch blocker: the current app advances some job state from request/polling paths. For
production, generation must continue after a browser tab closes, so a real worker entry
point and job-claiming implementation are P0.

### Optional Sweeper

Use either the worker loop or a separate Render Cron Job for cleanup tasks:

- Retry or fail stale `queued` and `running` jobs.
- Cancel jobs whose cancel request was not observed by a provider poll cycle.
- Tombstone obsolete failed jobs.
- Delete expired temporary objects according to the storage retention policy.

Do not use a cron-only design for active generation. It is acceptable for cleanup, but
media generation needs a continuously running worker for reasonable latency.

## Cloudflare

Use Cloudflare for DNS, TLS, WAF rules, and edge caching of safe static assets.

Recommended rules:

- Proxy the production hostname to the Render web service custom domain.
- Cache immutable Next.js static assets, such as `/_next/static/*`, according to origin
  cache headers.
- Bypass cache for `/api/*`, `/auth/*`, authenticated StoryCam pages, and any signed media
  URL paths.
- Add rate limits for unauthenticated auth endpoints, upload endpoints, story-world
  creation, storyboard generation, clip generation, and final work creation.
- Keep HTTPS-only mode enabled.
- Preserve request headers needed by Next.js and Supabase auth.

Cloudflare improves global edge reachability and static asset delivery. It does not make
dynamic authenticated flows local to every user; those requests still travel to the Render
Singapore service and Supabase Singapore.

## Environments

Maintain separate Supabase projects and Render services for staging and production.

```text
local
  -> local Supabase or mock mode
  -> no real provider calls unless explicitly opted in

staging
  -> Render Singapore web + worker
  -> Supabase staging in Singapore
  -> real provider keys for smoke tests
  -> Cloudflare staging hostname

production
  -> Render Singapore web + worker
  -> Supabase production in Singapore
  -> real provider keys
  -> Cloudflare production hostname
```

Do not point staging at production Supabase. Do not run real provider smoke tests against
production except for a controlled post-deploy canary.

## Runtime Requirements

- Node.js runtime compatible with Next.js 16 and the project lockfile.
- pnpm `10.22.0`.
- ffmpeg available at runtime.
- Writable temp directory for media composition.
- Enough memory and ephemeral disk for uploaded photos, generated clips, and final MP4
  composition. Use a paid Render instance size before real beta traffic.
- Public egress to Supabase, DeepSeek, OpenRouter, Inference.sh, Seedance, Sentry, and
  PostHog.
- No Edge runtime for provider orchestration or ffmpeg paths.

## Environment Variables

Exact values belong in Render and Supabase dashboards, not in this repository.

### Public or Client-Safe

- `NEXT_PUBLIC_APP_URL`: canonical app origin, for example `https://storycam.example.com`.
- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key.
- `NEXT_PUBLIC_POSTHOG_KEY`: only if PostHog is enabled.
- `NEXT_PUBLIC_POSTHOG_HOST`: PostHog cloud or self-hosted ingest host.

### Server-Only

- `SUPABASE_SERVICE_ROLE_KEY`: server and worker only.
- `STORYCAM_GENERATION_MODE=real` for staging real smoke and production.
- `STORYCAM_TEXT_PROVIDER`: expected production value is `deepseek` or `openrouter`.
- `STORYCAM_IMAGE_PROVIDER`: expected production value is `inference_sh` unless changed by
  provider readiness.
- `STORYCAM_VIDEO_PROVIDER=seedance_2_0`.
- `DEEPSEEK_API_KEY` and related model/base URL variables.
- `OPENROUTER_API_KEY` and related model/base URL variables if OpenRouter is used.
- `INFERENCE_API_KEY` and related model variables.
- `SEEDANCE_API_KEY`, base URL, model, and polling variables.
- `STORYCAM_PROVIDER_REFERENCE_URL_TTL_SECONDS`: long enough for provider-side temporary
  image/video references used by video generation.
- `ADMIN_EMAILS`: comma-separated Google account allowlist for the initial admin view.
- `SENTRY_DSN`: server/client DSN as configured by Sentry.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`: only if source maps are uploaded in
  CI or build steps.

Important current caveat: `next.config.ts` loads StoryCam config during `next build`.
Provider mode and required env must therefore be present during Render builds, not only at
runtime.

## Database, Auth, and Storage

Before staging:

- Apply Supabase migrations to the staging project.
- Verify generated DB snapshots and RLS expectations in `docs/generated/`.
- Configure Google OAuth in Supabase Auth for staging and production domains.
- Set Supabase Site URL and Redirect URLs for Cloudflare production and staging hosts.
- Create private storage buckets required by StoryCam artifacts.
- Verify users can access only their own sessions and artifacts through RLS and server
  ownership checks.

Before production:

- Apply the same migrations to production through a controlled migration step.
- Keep production backups enabled.
- Confirm no policy exposes raw uploads, prompt packets, provider payloads, or signed URLs
  to other users.
- Confirm signed URL TTLs are short enough for user access and long enough for provider
  reference workflows.

## Production Readiness Gaps

P0 before launch:

- Add a durable worker entry point and Render worker service.
- Add transactional job claiming or equivalent locking for generation jobs.
- Ensure browser polling only observes job state; it must not be required to advance jobs.
- Ensure worker produces and stores real final MP4 artifacts with ffmpeg.
- Add production health endpoints for web and worker-visible dependencies.
- Add Sentry with redaction for web, API routes, and worker.
- Add Cloudflare cache-bypass and rate-limit rules.
- Configure staging and production Supabase projects, Auth redirect URLs, Storage buckets,
  and provider secrets.
- Run real staging smoke tests for text, image, video, and final MP4.

P1 soon after launch:

- Build an internal `/admin` view.
- Add PostHog product analytics with a strict safe-event schema.
- Add automated post-deploy canaries.
- Add quota dashboards for provider cost and failure rates.
- Add a manual retry/cancel workflow for stuck jobs.

## Monitoring and Analytics

### Sentry

Use Sentry first for exceptions and performance traces across:

- Next.js server and API routes.
- Browser runtime errors.
- Background worker loops.
- Provider adapter failures after redaction.
- ffmpeg composition failures.

Redaction is mandatory. Do not send raw private input, user photos, scripts, prompts,
prompt packets, provider secrets, signed URLs, full storage paths, or raw provider response
bodies to Sentry.

### Render Observability

Use Render logs, metrics, health checks, deploy history, and rollback controls for platform
operations. Add alerts for:

- Web service unavailable.
- Worker process down or crash-looping.
- High memory/disk use during MP4 composition.
- Sustained 5xx rate.
- Deploy failures.

### Uptime Checks

Use an external uptime check for:

- Production homepage.
- Health endpoint.
- Auth callback sanity.
- A staging-only real generation canary when provider cost is acceptable.

### Product Analytics

Use PostHog over Umami for the first beta because StoryCam needs funnel and workflow
analytics, not only pageviews. Track safe product events such as:

- Story world requested, succeeded, failed.
- Story world confirmed.
- Storyboard generated and confirmed.
- Clip generation requested, succeeded, failed, canceled.
- Final MP4 requested, succeeded, failed.
- Restore flow opened and completed.
- Download clicked.

Do not capture story text, scripts, prompts, photo metadata, signed URLs, storage paths, or
provider payloads. Keep session replay disabled for the public beta unless there is an
internal allowlist and a separate privacy review.

Umami remains a good lightweight option for public marketing page analytics, but it is too
thin for the core generation funnel and provider-quality questions.

## Admin View

Build a small internal `/admin` surface after the worker is in place. Prefer app-native
admin over Retool for the first launch because StoryCam handles private user input and
media.

Admin v1 should include:

- Job list filtered by status, provider, user, and time.
- Session summary without raw private story text by default.
- Provider request ids and redacted failure categories.
- Artifact status and storage object health.
- Retry, cancel, recompose final MP4, and tombstone actions.
- Audit log for every admin action.

Initial access control can use `ADMIN_EMAILS` checked server-side against Google account
email. A database-backed `admin_users` table or Supabase `raw_app_meta_data` role can
replace it later.

## Release Flow

1. Local deterministic checks.
   - `scripts/check-pr.sh`
   - `pnpm storycam:verify:mock`

2. Staging mock deployment.
   - Deploy web and worker to Render Singapore.
   - Run Supabase verification against staging.
   - Confirm auth, restore, storage, and job lifecycle in mock mode.

3. Staging real-provider deployment.
   - Set `STORYCAM_GENERATION_MODE=real`.
   - Run opt-in real smoke tests for DeepSeek or OpenRouter, Inference.sh, Seedance, and
     final MP4.
   - Confirm the browser can close during generation and later restore the saved result.

4. Production release.
   - Run `scripts/check-release.sh`.
   - Apply production migrations.
   - Deploy web and worker.
   - Run a low-cost production canary.
   - Watch Sentry, Render metrics, provider dashboards, and Supabase logs.

## Rollback

- Keep the previous Render deploy available for rollback.
- If the worker is faulty, pause or roll back the worker first while keeping the web app
  read-only for existing artifacts when possible.
- If provider failures spike, disable new real generation or route to a safer provider
  configuration without exposing mock output as production final work.
- Roll database changes forward when possible. Avoid destructive rollbacks while user media
  and job rows are live.
- Keep private media and job records for investigation unless retention or deletion policy
  requires cleanup.

## Open Decisions

- Worker implementation shape: direct loop in Node.js, queue table with `locked_at`, or a
  Supabase/PG advisory-lock based claimant.
- Provider completion strategy: polling-only initially, or webhooks where providers support
  them.
- Render instance sizes for beta traffic and MP4 composition.
- Whether to use Render native runtime or Docker for pinned ffmpeg and media dependencies.
- PostHog Cloud versus self-hosting and exact analytics retention period.
- Admin permission source after the initial `ADMIN_EMAILS` allowlist.

## External References

- [Render Regions](https://render.com/docs/regions)
- [Render Native Runtimes](https://render.com/docs/native-runtimes)
- [Render Custom Domains](https://render.com/docs/custom-domains)
- [Supabase Regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase Deployment and Branching](https://supabase.com/docs/guides/deployment)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
