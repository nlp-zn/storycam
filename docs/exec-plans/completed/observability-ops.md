# Observability Ops Plan

Status: completed

## Scope

- Wire Sentry environment and release metadata consistently for Next.js server, browser,
  edge, and worker captures.
- Add deterministic redaction coverage for Sentry payloads.
- Add a production-safe live verification command that can run as an uptime check without
  provider calls or dependency installation.
- Add a scheduled GitHub uptime workflow for public health, auth callback, and optional
  deep health checks.
- Document the Sentry, Cloudflare, Render, and uptime operating runbook for beta launch.

## Non-Goals

- Do not add PostHog, `/admin`, or paid-provider canaries in this slice.
- Do not treat Cloudflare's burst guard as the complete provider-cost control layer.
- Do not treat this as the staging-environment implementation.

## Success Criteria

- [x] `SENTRY_ENVIRONMENT` and release tags are available in all Sentry init paths without
  exposing private input.
- [x] A maintainer can run `pnpm storycam:verify:live` against production and receive a clear
  pass/fail result.
- [x] GitHub Actions can run the same live checks on a schedule.
- [x] Deployment docs point to one concrete observability runbook.
- [x] Production beta has a recorded release, uptime check, and real full-chain smoke.

## Completion Note

Completed on 2026-05-14 as part of the StoryCam production beta release.

- Sentry is configured for StoryCam production capture with redacted context boundaries.
- Cloudflare fronts `storycam.znbuild.com`; cache/WAF/rate-limit rules are managed outside
  git. The current rate-limit posture is a 10-second burst guard, not full cost control.
- GitHub Actions runs `.github/workflows/uptime.yml` for production uptime.
- Render web and worker run in Singapore from the `main` branch.
- The `v0.1.2.0` production beta release passed real full-chain smoke:
  DeepSeek/OpenRouter text, Inference.sh images, Seedance video, and ffmpeg final MP4 on
  Render Native Runtime. Closing the page during generation did not block worker
  completion, restore, preview, or MP4 download.

## Remaining Follow-Ups

- Confirm Render dashboard notification policies for deploy/build failures and unhealthy
  running services. Cover memory pressure, disk pressure, worker crash loops, and sustained
  5xx through Render metrics/logs, Sentry, and uptime checks until dedicated metrics
  alerting exists.
- Add a separate staging Render/Supabase/Cloudflare environment before broader beta traffic
  or risky provider/runtime changes.
- Add PostHog safe product analytics and an internal `/admin` surface in a P1 slice.
