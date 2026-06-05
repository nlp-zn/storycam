# StoryCam Agent Constitution

This file is the short constitution for agents working in StoryCam. Keep it small.
Put durable project knowledge in `docs/`; put only navigation, principles, and hard
rules here. If a rule needs examples, tables, or versioned details, it probably belongs
in `docs/` with a link from this file.

## Context Loading

StoryCam uses Harness-style progressive disclosure: this file is the agent map,
`docs/README.md` is the documentation map, and task-specific docs are loaded only
when needed. See `docs/references/openai-harness-engineering.md` for the local
reference.

1. Start with `docs/README.md` to choose the smallest relevant source-of-truth set.
2. Read `docs/product-specs/index.md` before product behavior changes.
3. Read `docs/ARCHITECTURE.md` before backend, data, provider, storage, or job work.
4. Read `docs/SECURITY.md` before auth, storage, provider keys, logs, uploads, restore, or sharing work.
5. Read `docs/references/providers.md` and `docs/references/local-dev.md` before provider wiring, env behavior, smoke tests, or local auth changes.
6. Read `docs/FRONTEND.md`, `docs/DESIGN.md`, and `docs/design-docs/index.md` before UI work.
7. Read `docs/PR_REVIEW.md` before reviewing, shipping, or changing gates.
8. Check `docs/exec-plans/active/` before large changes. If none exists, create a short plan first.

Treat `docs/exec-plans/completed/`, `docs/learning/`, and large external snapshots
under `docs/references/` as secondary context, not current product truth, unless a
current source-of-truth doc points there.

## Constitution

1. Think before coding.
   State assumptions when they matter. If the request has multiple plausible meanings,
   surface the tradeoff instead of silently choosing one. Push back when the simpler
   path is better for StoryCam.

2. Simplicity first.
   Build the smallest thing that satisfies the goal. Do not add speculative features,
   abstractions, switches, configuration, or fallback paths. If the solution looks
   larger than the problem, simplify it before editing more files.

3. Surgical changes.
   Touch only what the request requires. Match local style. Do not refactor adjacent
   code, rewrite comments, reformat unrelated files, or delete pre-existing dead code
   unless the user asked for that cleanup. Every changed line should trace back to the
   task.

4. Goal-driven execution.
   Convert work into verifiable success criteria, then loop until the checks match the
   goal. For bugs, prefer a reproducing test or deterministic proof. For UI, verify
   the actual surface, not just the component code.

## Product North Star

StoryCam is an AI personal story-theater product for ordinary users. It is not an
industrial short-drama production backend, a professional shot-table tool, or a public
content marketplace.

The MVP loop is:

```text
private idea + optional photos
  -> script + character assets + scene assets
  -> user confirms story world
  -> one core storyboard group
  -> optional expansion cards
  -> one generated clip for the confirmed core group
  -> final work composition
  -> account-scoped save and preview
```

## Non-Negotiables

- Do not skip story, script, character, scene, or storyboard confirmation.
- Core storyboard groups are clip groups, not decorative stills.
- Expanded storyboard cards guide their parent group; they do not trigger video calls by default.
- Keep provider calls server-side. The browser must not call model or media providers directly.
- Do not expose Shanyin-style professional shot tables, prompt packets, raw provider payloads, signed URLs, or model parameters to ordinary users.
- Do not log raw private input, full prompts, provider secrets, signed URLs, or unredacted provider errors.
- Mock mode must be explicit. When testing real generation, verify provider diagnostics from `docs/references/providers.md` instead of trusting a plausible response body.
- Remember shell-exported env vars override `.env.local`; stale provider env can keep a flow on mock after restart.
- Do not treat `~/.gstack/` output as canonical project documentation.

## Quality Gates

- Use the smallest deterministic check that proves the change; reserve full gates for review, ship, PR, or merge. See `docs/PR_REVIEW.md` for the test selection strategy.
- "PR gate", "ship review", "pre-PR check", "review before PR", "push 前检查", and similar requests mean: run the StoryCam PR Gate from `docs/PR_REVIEW.md`.
- PR Gate is review-only. Do not commit, push, or open a PR during PR Gate.
- "ship", "gstack-ship", "可以 push 并提 PR", "开 PR 到 dev", and similar publishing requests mean: run the StoryCam Ship Gate from `docs/PR_REVIEW.md`.
- Ship Gate may commit, push, and create a PR only after the final gate decision is GO.
- PR Gate and Ship Gate must produce three separate reviewer reports: `code-reviewer`, `security-auditor`, and `test-engineer`.
- Run the reviewers in parallel when subagents are available and the user explicitly requested the gate. Otherwise run them sequentially, keeping reports separate.
- Final gate output must include GO/NO-GO, deterministic checks, reviewer verdicts, blockers, fixes, accepted risks, coverage gaps, verification evidence, and rollback notes.
- Do not hide AI review inside git hooks or CI. Hooks and CI run deterministic checks; AI review runs only when the user asks for the gate.

## Documentation Rule

When docs and code disagree, fix the drift in the same change. Add long-lived context to
the right file under `docs/`, update the nearest index, and keep `AGENTS.md` short.
Do not duplicate long technical lists here; link to the canonical doc instead. If a
new durable rule makes this file sprawl, move the detail to `docs/` and leave only the
constitutional constraint or navigation pointer here.
