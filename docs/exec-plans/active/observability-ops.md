# Observability Ops Plan

Status: active

## Scope

- Wire Sentry environment and release metadata consistently for Next.js server, browser,
  edge, and worker captures.
- Add deterministic redaction coverage for Sentry payloads.
- Add a production-safe live verification command that can run as an uptime check without
  provider calls or dependency installation.
- Add a scheduled GitHub uptime workflow for public health, auth callback, and optional
  deep health checks.
- Document the Sentry, Cloudflare, and uptime operating runbook for beta launch.

## Non-Goals

- Do not create or mutate Sentry projects without valid Sentry authorization.
- Do not apply Cloudflare WAF or rate-limit rules until exact thresholds are confirmed.
- Do not add PostHog, `/admin`, or paid-provider canaries in this slice.

## Success Criteria

- [x] `SENTRY_ENVIRONMENT` and release tags are available in all Sentry init paths without
  exposing private input.
- [x] A maintainer can run `pnpm storycam:verify:live` against production and receive a clear
  pass/fail result.
- [x] GitHub Actions can run the same live checks on a schedule.
- [x] Deployment docs point to one concrete observability runbook.

## Open External Steps

- Re-authorize Sentry access, create/confirm the production project, and set the Render
  Sentry DSNs.
- Add `STORYCAM_PRODUCTION_DEEP_HEALTH_TOKEN` as a GitHub repository secret.
- Apply Cloudflare cache/WAF/rate-limit rules. The current live check sees
  `cf-cache-status=DYNAMIC` for sampled Next.js static assets, so static edge caching is
  not yet confirmed.
