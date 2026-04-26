# StoryCam Docs Index

This directory is the source of truth for StoryCam. The repo knowledge structure follows an agent-readable pattern: short maps, indexed docs, active execution plans, generated references, and clear boundaries.

## Read Order

1. `../AGENTS.md` for the agent map.
2. `../ARCHITECTURE.md` for system boundaries.
3. `product-specs/index.md` for product source of truth.
4. `exec-plans/active/` for current implementation work.
5. `SECURITY.md`, `RELIABILITY.md`, `FRONTEND.md`, and `DESIGN.md` for domain-specific rules.

## Top-Level Guides

- `DESIGN.md` — product/design principles and UI tone.
- `FRONTEND.md` — frontend implementation rules.
- `PLANS.md` — how to create, update, and retire plans.
- `PRODUCT_SENSE.md` — product judgment and positioning.
- `QUALITY_SCORE.md` — how to score readiness and quality.
- `RELIABILITY.md` — jobs, provider failures, recovery, observability.
- `SECURITY.md` — auth, Supabase RLS, storage, secrets, privacy.
- `references/local-dev.md` — local mock-mode setup and verification commands.
- `references/providers.md` — provider mode matrix and opt-in real smoke policy.

## Directories

- `product-specs/` — product specs and product index.
- `exec-plans/` — active and completed implementation plans plus tech debt tracker.
- `design-docs/` — design briefs, design references, and core beliefs.
- `generated/` — generated schemas and machine-readable summaries.
- `references/` — external/internal references copied or summarized for local agent use.

## Current Canonical Docs

- Product spec: `product-specs/storycam-film-machine-design.md`
- Product vision: `product-specs/product-vision.md`
- Active implementation plan: `exec-plans/active/storycam-web-mvp-implementation-plan.md`
- Active test plan: `exec-plans/active/test-plan.md`
- Local development: `references/local-dev.md`
- Provider modes: `references/providers.md`
- Provider contract: `generated/provider-contract.md`
- UI design brief: `design-docs/storycam-ui-design.md`
- Shanyin director reference: `references/shanyin-director-master/`
- Harness engineering reference: `references/openai-harness-engineering.md`

## Documentation Rules

- Keep durable context in `docs/`.
- Keep `AGENTS.md` short and navigational.
- Update indexes when moving or adding docs.
- Plans are first-class artifacts. Active plans live in `exec-plans/active/`; completed plans move to `exec-plans/completed/`.
- Generated docs must say how they were generated or what source they summarize.
- Do not treat `~/.gstack/` output as canonical project documentation.
