# StoryCam

StoryCam is a web-first AI private story-theater for turning a personal idea and optional photos into a short cinematic story flow: story world, storyboard, generated clip, and account-scoped final work preview.

It is built for ordinary users, not as an industrial short-drama production backend. The product keeps professional prompt packets, provider payloads, and shot-table internals server-side.

## Current Status

StoryCam is an active MVP codebase. The default local and CI path uses mock providers so the app can run without paid AI credentials. Real DeepSeek, OpenRouter, Inference.sh, and Seedance smoke tests are opt-in and secret-gated.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Local shadcn-style UI primitives plus StoryCam cinematic wrappers
- Supabase Auth, Postgres, RLS, and private Storage
- Server-only provider adapters for DeepSeek, OpenRouter, Inference.sh, and Seedance 2.0
- Vitest and Playwright for unit, API, E2E, and visual QA

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Fill `.env.local` with Supabase values. Keep these defaults for mock-mode development:

```text
STORYCAM_GENERATION_MODE=mock
STORYCAM_TEXT_PROVIDER=mock
STORYCAM_MULTIMODAL_PROVIDER=mock
STORYCAM_IMAGE_PROVIDER=mock
STORYCAM_VIDEO_PROVIDER=mock
STORYCAM_FINAL_WORK_PROVIDER=mock
```

Open the app at `http://localhost:3000`.

## Verification

StoryCam uses progressive gates:

```bash
scripts/check-local.sh    # lint, typecheck, unit tests
scripts/check-pr.sh       # local gate + production build
scripts/check-dev.sh      # PR gate + E2E + visual QA
scripts/check-release.sh  # dev gate + mock verification + audit
```

Useful direct commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:e2e
pnpm qa:visual
pnpm storycam:verify:mock
```

## Documentation

Start here:

- [Agent map](AGENTS.md)
- [Docs index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product specs](docs/product-specs/index.md)
- [Local development](docs/references/local-dev.md)
- [Provider modes](docs/references/providers.md)
- [Deployment plan](docs/DEPLOYMENT.md)
- [PR review gate](docs/PR_REVIEW.md)
- [Changelog](CHANGELOG.md)

For UI work, use [Frontend](docs/FRONTEND.md), [Design](docs/DESIGN.md), and the current visual references in [design docs](docs/design-docs/index.md).

## Safety Notes

- Do not commit provider keys or Supabase service-role secrets.
- Do not log raw private input, full prompts, prompt packets, signed URLs, or unredacted provider errors.
- Do not expose public sharing links in Phase 1.
- Real provider tests require explicit env setup and may spend provider credits.
