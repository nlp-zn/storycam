# StoryCam Observability Runbook

Status: beta launch runbook for Sentry, Cloudflare, Render, and uptime checks.

## Stack

- Sentry captures application exceptions and worker/provider failures after redaction.
- Render remains the platform signal for deploys, service health, logs, memory, disk, and
  worker restarts.
- Cloudflare owns DNS, TLS, WAF/rate limits, and cache rules for immutable static assets.
- GitHub Actions runs a lightweight production uptime check every 15 minutes.
- Supabase logs and dashboards remain the source for Auth, Postgres, and Storage health.

## Sentry

Configure the same Sentry project for the web service and worker unless noise requires
splitting them later. Keep session replay disabled for beta.

Required Render env:

- `SENTRY_DSN`: server and worker exception capture.
- `NEXT_PUBLIC_SENTRY_DSN`: browser exception capture.
- `SENTRY_ENVIRONMENT=production`: server and worker environment tag.
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`: browser environment tag.

Optional release/source-map env:

- `SENTRY_RELEASE`: explicit release id when not relying on Render's git commit env.
- `NEXT_PUBLIC_SENTRY_RELEASE`: browser release id if the public bundle must match server
  releases exactly.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`: source map upload during build.

Redaction rules:

- Allowed context: job id, job type, provider kind/name, status, attempts, max attempts,
  redacted error code, and hashed session/user identifiers.
- Forbidden context: raw user input, prompts, scripts, provider request/response bodies,
  photo metadata, signed URLs, storage paths, cookies, auth headers, and secrets.
- The shared scrubber lives in `src/server/monitoring/sentryRedaction.ts`; worker capture
  must go through `src/server/monitoring/sentryWorker.ts`.

Verification:

```bash
pnpm test src/lib/monitoring/sentryEnvironment.test.ts src/server/monitoring/sentryRedaction.test.ts
```

## Cloudflare

The production hostname is `storycam.znbuild.com`. Keep it proxied through Cloudflare and
point it at the Render custom domain.

Baseline DNS/TLS:

- Proxied CNAME from `storycam.znbuild.com` to the Render custom domain target.
- SSL/TLS mode: Full strict.
- Always Use HTTPS: enabled.

Cache rules:

| Path | Action | Reason |
| --- | --- | --- |
| `/_next/static/*` | Cache according to origin headers | Immutable hashed build assets are safe to cache globally. |
| `/api/*` | Bypass cache | API responses are user/session scoped or operational. |
| `/auth/*` | Bypass cache | OAuth callback and auth state must stay dynamic. |
| `/storycam/*` | Bypass cache | Authenticated workspace pages are user scoped. |
| `/api/storycam-media/*/download` | Bypass cache | Downloads are authenticated and may issue short-lived media responses. |

Rate-limit starting points:

| Surface | Initial rule |
| --- | --- |
| `/auth/*` | Limit abusive unauthenticated bursts by IP. |
| `/api/uploads` | Low burst limit by IP; server ownership and file checks still decide access. |
| `/api/story-world` and `/api/storyboard` | Moderate burst limit by IP to protect text-provider cost. |
| `/api/story-world/assets/*` and storyboard image regeneration | Moderate burst limit by IP to protect image-provider cost. |
| `/api/storyboard-groups/*/generate-clip` and `/api/final-work` | Strict hourly limit by IP because video/final MP4 are expensive. |

Cloudflare rate limits are defense-in-depth. StoryCam's server-side per-user quotas remain
the cost-control source of truth.

Operational note: Wrangler is useful for Cloudflare auth and worker-oriented resources.
Zone cache/WAF/rate-limit rules should be applied through the Cloudflare dashboard,
Rulesets API, or Terraform and then recorded here.

## Uptime

Run the live check locally before and after production changes:

```bash
pnpm storycam:verify:live
```

The check covers:

- `GET /api/health`: public readiness, `ok=true`, and `Cache-Control: no-store`.
- `GET /api/health/deep` without a token: returns `404` and no-store.
- `GET /auth/callback?next=/storycam/input`: redirects to the canonical production
  origin, not Render's internal origin.
- `GET /api/health/deep` with `STORYCAM_DEEP_HEALTH_TOKEN`: optional DB and Storage check.
- A sampled `/_next/static/*` asset: verifies immutable origin cache headers and reports
  Cloudflare cache status when present.

GitHub Actions runs `.github/workflows/uptime.yml` every 15 minutes against
`https://storycam.znbuild.com`. Add repository secret
`STORYCAM_PRODUCTION_DEEP_HEALTH_TOKEN` to include the authenticated deep health check.

To make Cloudflare cache status mandatory in a manual run:

```bash
STORYCAM_REQUIRE_CLOUDFLARE_STATIC_CACHE=1 pnpm storycam:verify:live
```

## Alert Routing

- GitHub scheduled workflow failures should notify repository watchers.
- Render alerts should cover web health check failure, worker restarts, deploy failure,
  memory pressure, disk pressure, and sustained 5xx.
- Sentry alerts should page on new high-severity server/worker issues and provider or
  ffmpeg failure spikes.
- Provider dashboards should be checked during real smoke tests and incidents because
  Sentry only sees StoryCam-side redacted failures.
