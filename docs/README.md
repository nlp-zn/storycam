# StoryCam Docs Index

This directory is the source of truth for StoryCam. Keep docs small, indexed, and explicit about whether they are product specs, architecture maps, generated snapshots, references, or historical plans.

## Read Order

1. `../AGENTS.md` for the agent map.
2. `ARCHITECTURE.md` for system boundaries and current implementation shape.
3. `product-specs/index.md` before changing product behavior.
4. `SECURITY.md`, `RELIABILITY.md`, `FRONTEND.md`, and `DESIGN.md` for domain rules.
5. `DEPLOYMENT.md` and `OBSERVABILITY.md` before deployment, infrastructure, monitoring,
   or launch-readiness work.
6. `PR_REVIEW.md` before reviewing, shipping, or changing gates.
7. `learning/index.md` when using StoryCam as an agentic full-stack case study.
8. `exec-plans/active/` only when there is an active feature plan.

## Canonical Docs

- `product-specs/storycam-film-machine-design.md` — current MVP product specification.
- `product-specs/product-vision.md` — original positioning and user insight.
- `ARCHITECTURE.md` — current system and code boundary map.
- `SECURITY.md` — auth, RLS, storage, provider keys, logs, privacy.
- `RELIABILITY.md` — async jobs, retries, cancellation, late results, provider failures.
- `DEPLOYMENT.md` — production deployment topology, environment plan, monitoring, rollout, and launch gaps.
- `OBSERVABILITY.md` — Sentry, Cloudflare, Render alerting, and uptime runbook.
- `FRONTEND.md` — frontend implementation rules and current user-facing surfaces.
- `DESIGN.md` — visual principles and current design references.
- `PR_REVIEW.md` — progressive deterministic gates, Codex PR Gate, Ship Gate.
- `QUALITY_SCORE.md` — review rubric for major changes.
- `PLANS.md` — execution plan lifecycle.
- `learning/index.md` — public learning paths, Bilibili build series, and portfolio course links.
- `../CHANGELOG.md` — release history.
- `../CONTRIBUTING.md` — open-source contribution workflow.
- `../README.zh-CN.md` — Simplified Chinese README and Bilibili series overview.
- `../SECURITY.md` — vulnerability reporting policy.

## Directories

- `product-specs/` — product specs and product index.
- `design-docs/` — current UI references, design beliefs, and retained visual source images.
- `exec-plans/active/` — current implementation plans; may be empty between features.
- `exec-plans/completed/` — historical plans with completion notes.
- `generated/` — hand-maintained implementation snapshots derived from code and migrations.
- `learning/` — curated public case-study and course links; not the product source of truth.
- `references/` — local development, provider, and external reference material for agents.
- `pr-reviewers/` — fixed prompts for the three independent PR Gate reviewer perspectives.

## Current Generated Snapshots

- `generated/api-contract.md` — implemented API route and response contract snapshot.
- `generated/db-schema.md` — Supabase migration summary.
- `generated/job-lifecycle.md` — async job lifecycle snapshot.
- `generated/privacy-logging.md` — privacy and logging contract.
- `generated/provider-contract.md` — provider boundary contract.

## Reference Docs

- `references/local-dev.md` — local mock-mode setup, commands, auth bypass, and verification gates.
- `references/providers.md` — provider mode matrix and opt-in real smoke policy.
- `references/inference-sh.md` — Inference.sh SDK, CLI, async task, and image-output rules.
- `references/seedance/` — local Seedance reference material.
- `references/shanyin-director-master-source.md` — Shanyin provenance and StoryCam translation notes.
- `references/shanyin-director-master/` — retained local snapshot; read only when internal director-methodology context is explicitly needed.
- `references/openai-harness-engineering.md` — agent-readable repo structure reference.

## Documentation Rules

- Keep durable context in `docs/`.
- Keep `AGENTS.md` short and navigational.
- Update indexes when moving, deleting, or adding docs.
- Generated snapshots must name their source files and be refreshed when code contracts change.
- Active plans live in `exec-plans/active/`; completed plans move to `exec-plans/completed/`.
- Do not treat `~/.gstack/` output as canonical project documentation.
- When docs and code disagree, fix the drift in the same change.
