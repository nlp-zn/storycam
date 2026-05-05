# Product Specs Index

Product specs define what StoryCam should do and why. Engineering plans must point back to these specs.

## Canonical Specs

- `storycam-film-machine-design.md` — current MVP product specification.
- `product-vision.md` — original product positioning and user insight.

## Current Product Decisions

- StoryCam is a Web-first AI private story theater for ordinary users.
- Phase 1 requires account login through Supabase Auth, preferably Google login.
- Data uses Supabase Postgres; media uses Supabase Storage.
- Story-world text uses DeepSeek official strict function calling; core storyboard text and multimodal understanding use provider adapters, with OpenRouter still available for structured text and multimodal paths.
- Story-world, core storyboard, and expanded storyboard images use the provider boundary and currently prefer Inference.sh `openai/gpt-image-2`.
- Seedance 2.0 is the first real video generation path.
- First version does not include sharing links, payments, marketplace, or public feed.

## How To Update

When changing product behavior:

1. Update the relevant product spec.
2. Update active execution plans if implementation scope changes.
3. Update `docs/README.md` only if the canonical doc set changes.
