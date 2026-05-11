# StoryCam Agent Map

This file is a short navigation map for agents. Do not turn it into a handbook. Put durable project knowledge in `docs/` and keep this file small.

## Start Here

1. Read `docs/README.md` to find the current source of truth.
2. Read `ARCHITECTURE.md` before backend, data, provider, storage, or job work.
3. Read `docs/product-specs/index.md` before product behavior changes.
4. Read `docs/exec-plans/active/` before implementation work.
5. Read `docs/SECURITY.md` before touching auth, Supabase, storage, provider keys, logs, uploads, or sharing.
6. Read `docs/references/providers.md` and `docs/references/local-dev.md` before changing provider wiring, env behavior, or real-provider smoke paths.
7. Read `docs/FRONTEND.md` and `docs/DESIGN.md` before UI work.
8. Read `docs/PR_REVIEW.md` before opening, reviewing, or preparing a PR.

## Project North Star

StoryCam is an AI private story-theater product for ordinary users. It is not an industrial short-drama production backend.

The MVP loop is:

```text
private idea + optional photos
  -> script + character assets + scene assets
  -> user confirms story world
  -> storyboard script + 1-3 core storyboard groups
  -> optional expansion cards
  -> one Seedance 2.0 clip per confirmed core group
  -> final work composition
  -> account-scoped save and preview
```

## Current Technical Baseline

- Web-first: Next.js App Router + TypeScript + Tailwind.
- Auth: Supabase Auth, Google login first.
- Database: Supabase Postgres with RLS.
- Media: Supabase Storage private buckets.
- AI orchestration: Vercel AI SDK.
- Text/multimodal/image models: OpenRouter through provider adapters.
- Step 2 story-world text uses AI SDK structured JSON output with OpenRouter fallback models; see `docs/references/providers.md`.
- Video: Seedance 2.0 through `VideoGenerationProvider`.
- First version does not include public sharing, payment, marketplace, public feed, or mobile-only UX.

## Working Rules

- Keep canonical decisions in `docs/`.
- Do not treat `~/.gstack/` output as canonical project documentation.
- Do not skip story/script/character/scene confirmation.
- Core storyboard groups are clip groups, not decorative stills.
- Expanded storyboard cards guide their parent group; they do not trigger video calls by default.
- Do not expose Shanyin-style professional shot tables to ordinary users.
- Do not log raw private input, full prompts, provider secrets, signed URLs, or unredacted provider errors.
- Do not silently accept a fixed mock story-world response when testing real text generation; check `diagnostics.textProvider` or `x-storycam-text-provider`.
- Remember shell-exported env vars override `.env.local`; stale `STORYCAM_TEXT_PROVIDER=mock` keeps Step 2 on mock even after restart.
- When docs and code disagree, update the docs or the code in the same change. Drift is a bug.

## Agent Readability

Prefer small, indexed, cross-linked docs over long instruction blobs. If you add a new durable decision, put it in the right document and link it from the nearest index.

## PR Gate

When the user asks for "PR gate", "ship review", "pre-PR check", "review before PR", "push 前检查", or similar, run the StoryCam PR Gate from `docs/PR_REVIEW.md`. PR Gate is review-only: do not commit, push, or open a PR.

When the user asks for "ship", "gstack-ship", "可以 push 并提 PR", "开 PR 到 dev", or similar publishing language, run the StoryCam Ship Gate from `docs/PR_REVIEW.md`. Ship Gate may commit, push, and create a PR only after the final gate decision is GO.

When the StoryCam Codex hook injects a PR gate reminder after a successful Codex-run `git push`, ask the user whether to run the StoryCam PR gate before ending the turn. Do not run the AI review without confirmation.

PR Gate and Ship Gate must produce three independent reviewer reports:

- `code-reviewer` from `docs/pr-reviewers/code-reviewer.md`.
- `security-auditor` from `docs/pr-reviewers/security-auditor.md`.
- `test-engineer` from `docs/pr-reviewers/test-engineer.md`.

Run the three reviewers in parallel when the client supports subagents and the user has explicitly requested PR Gate or Ship Gate; otherwise run the three reviewer prompts sequentially while keeping the reports separate. Merge the results into a GO/NO-GO decision with deterministic evidence, reviewer verdicts, blockers, recommended fixes, accepted risks, coverage gaps, verification evidence, and rollback notes. Keep deterministic checks in CI or `scripts/pr-ready.sh`; do not hide AI review inside a git hook.
