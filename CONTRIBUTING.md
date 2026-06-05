# Contributing to StoryCam

StoryCam is a product-first AI application. Contributions should preserve the private mini-theater loop, keep provider calls server-side, and make the guided creation flow easier to trust.

## Start Here

1. Read `AGENTS.md` for project rules and non-negotiables.
2. Read `docs/README.md` for the current documentation map.
3. For product behavior, read `docs/product-specs/index.md`.
4. For backend, provider, storage, or job work, read `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/RELIABILITY.md`.
5. For UI work, read `docs/FRONTEND.md`, `docs/DESIGN.md`, and `docs/design-docs/index.md`.

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

StoryCam defaults to mock providers. A Supabase local stack or dedicated Supabase test project is still required for auth, database, and private storage. Real provider smoke tests are opt-in and may spend credits.

## Development Loop

- Keep changes surgical and tied to the issue or task.
- Prefer the existing StoryCam service, repository, provider, and UI patterns.
- Do not expose raw prompts, provider payloads, signed URLs, secrets, or Shanyin-style internals in user-facing UI.
- Update docs when behavior, architecture, commands, provider contracts, or quality gates change.
- Use the smallest deterministic check that proves the change before widening to full gates.

Common checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
scripts/check-local.sh
scripts/check-pr.sh
```

## Pull Requests

Every meaningful PR should include:

- a focused summary,
- deterministic verification evidence,
- screenshots or browser evidence for UI flow changes,
- docs updates when durable behavior changed,
- known risks and rollback notes for production-bound work.

StoryCam's review process is documented in `docs/PR_REVIEW.md`. PR Gate and Ship Gate are explicit workflows; they are not automatic git hooks.

## Security and Privacy

Do not open an issue with private user input, provider responses, signed media URLs, service-role keys, API keys, cookies, auth headers, or production logs that include sensitive data. Use the reporting process in `SECURITY.md`.
