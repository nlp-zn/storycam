# Premiere Ticket Entitlements

Status: active
Date: 2026-05-19

## Goal

Give every logged-in user one free StoryCam premiere experience, let admins issue more
premiere tickets by email, and use tickets as the ordinary-user cost-control boundary for
real generation. Keep mock mode unchanged.

## Scope

- Add premiere-ticket and admin-audit tables.
- Bind real generation jobs to a ticket and enforce per-ticket budgets.
- Lazy-issue one automatic ticket through `/api/auth/me`.
- Add an internal `/admin` ticket issuance page protected by `ADMIN_EMAILS`.
- Update docs and generated snapshots.

## Success Criteria

- New and existing logged-in users receive one automatic 14-day premiere ticket exactly once.
- Real story-world generation reserves a ticket for the session; later real jobs for that
  session reuse the same ticket.
- Tickets allow one complete production budget: 3 story-world jobs, 3 storyboard jobs,
  30 image jobs, 1 video job, and 1 final-work job.
- Admins can issue additional premiere tickets by email and every issuance writes an audit
  event.
- Non-admins cannot call admin ticket APIs.

## Verification

- Add targeted unit/API coverage for auth lazy issuance, entitlement budget checks, and
  admin issuance.
- Run targeted vitest, then `pnpm typecheck`, `pnpm lint`, and `pnpm test:api`.
