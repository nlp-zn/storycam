# Product Specs Index

Product specs define what StoryCam should do and why. Engineering plans must point back to these specs.

## Canonical Specs

- `storycam-film-machine-design.md` — current MVP product specification.
- `product-vision.md` — original product positioning and user insight.

## Current Product Decisions

- StoryCam is a Web-first AI private story theater for ordinary users.
- Phase 1 requires account login through Supabase Auth, preferably Google login.
- Data uses Supabase Postgres; media uses Supabase Storage.
- AI orchestration uses Vercel AI SDK; text/multimodal/image models use OpenRouter-backed adapters.
- Seedance 2.0 is the first real video generation path.
- First version does not include sharing links, payments, marketplace, or public feed.

## How To Update

When changing product behavior:

1. Update the relevant product spec.
2. Update active execution plans if implementation scope changes.
3. Update `docs/README.md` only if the canonical doc set changes.
