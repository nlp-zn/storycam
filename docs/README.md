# StoryCam Docs Map

This directory is StoryCam's versioned context system. `../AGENTS.md` is the
short constitution for agents; this file maps which docs are current source of
truth, which are operating manuals, and which are references or history.

## Context Loading

Load the smallest set that matches the task:

| Task | Read First |
| --- | --- |
| Product behavior, user flow, artifact boundaries | `product-specs/index.md`, then the relevant spec |
| Backend, API, data, storage, providers, jobs | `ARCHITECTURE.md`, `SECURITY.md`, `RELIABILITY.md` |
| Provider wiring, local smoke, real-generation diagnostics | `references/providers.md`, `references/local-dev.md` |
| UI, interaction, visual direction | `FRONTEND.md`, `DESIGN.md`, `design-docs/index.md` |
| Deployment, monitoring, production readiness | `DEPLOYMENT.md`, `OBSERVABILITY.md` |
| PR review, ship gates, reviewer prompts | `PR_REVIEW.md`, `pr-reviewers/` |
| Large feature or risky refactor | `PLANS.md`, `exec-plans/active/` |
| Public learning or case-study context | `learning/index.md` |

## Current Source Of Truth

- `product-specs/storycam-film-machine-design.md` — current MVP product specification.
- `product-specs/product-vision.md` — original positioning and user insight.
- `ARCHITECTURE.md` — current system and code boundary map.
- `SECURITY.md` — auth, RLS, storage, provider keys, logs, privacy.
- `RELIABILITY.md` — async jobs, retries, cancellation, late results, provider failures.
- `FRONTEND.md` — frontend implementation rules and current user-facing surfaces.
- `DESIGN.md` and `design-docs/index.md` — design principles and current visual sources.
- `DEPLOYMENT.md` and `OBSERVABILITY.md` — production topology, monitoring, and runbooks.
- `PR_REVIEW.md` — progressive deterministic gates, Codex PR Gate, and Ship Gate.
- `PLANS.md` — execution plan lifecycle.

## Generated Snapshots

Generated snapshots are hand-maintained summaries derived from code, migrations,
and tests. They are current only when refreshed with the implementation change
that affects them.

- `generated/api-contract.md` — implemented API route and response contract snapshot.
- `generated/db-schema.md` — Supabase migration summary.
- `generated/job-lifecycle.md` — async job lifecycle snapshot.
- `generated/privacy-logging.md` — privacy and logging contract.
- `generated/provider-contract.md` — provider boundary contract.

## References And History

- `references/index.md` — local development, provider, Harness, Seedance, and Shanyin reference map.
- `learning/index.md` — public learning paths, Bilibili build series, and portfolio course links.
- `exec-plans/active/` — current implementation plans; may be empty between features.
- `exec-plans/completed/` — historical plans with completion notes. Do not treat them as current truth without checking current source-of-truth docs and code.
- `exec-plans/tech-debt-tracker.md` — accepted debt that was not fixed immediately.

## Open Source Project Docs

- `../README.md` and `../README.zh-CN.md` — public project overview.
- `../CONTRIBUTING.md` — open-source contribution workflow.
- `../SECURITY.md` — vulnerability reporting policy.
- `../CHANGELOG.md` — release history.

## Directory Map

- `product-specs/` — product specs and product index.
- `design-docs/` — current UI references, design beliefs, and retained visual source images.
- `generated/` — implementation snapshots derived from code and migrations.
- `references/` — local development, provider, and external reference material for agents.
- `learning/` — curated public case-study and course links; not product source of truth.
- `exec-plans/` — active plans, completed plans, and tech debt.
- `pr-reviewers/` — fixed prompts for the three independent PR Gate reviewer perspectives.

## Documentation Rules

- Keep durable context in `docs/`.
- Keep `AGENTS.md` short and navigational.
- Update indexes when moving, deleting, or adding docs.
- Do not duplicate source-of-truth maps inside product specs or historical plans.
- Generated snapshots must name their source files and be refreshed when code contracts change.
- Active plans live in `exec-plans/active/`; completed plans move to `exec-plans/completed/`.
- Do not treat `~/.gstack/` output as canonical project documentation.
- When docs and code disagree, fix the drift in the same change.
