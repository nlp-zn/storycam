# PR Review Gate

Status: active quality contract.

## Goal

Every StoryCam PR should have two kinds of evidence before merge:

- progressive deterministic checks from local scripts or CI,
- Codex review evidence from three independent perspectives.

Deterministic checks block mechanically. Codex review catches product, architecture, security, reliability, and test gaps that raw commands miss.

The final goal of this gate is stable review evidence: every PR gate or ship gate must produce three independent reviewer reports, then the main agent merges them into one `GO` or `NO-GO` decision.

## Gate Modes

Use PR Gate when the user asks for:

- `PR gate`,
- `ship review`,
- `pre-PR check`,
- `review before PR`,
- `push 前检查`,
- or similar review-only wording.

PR Gate is read-only for git and publishing actions. It must not commit, push, or open a PR. It runs deterministic checks, runs the three reviewer perspectives, and returns the merged `GO` or `NO-GO` report.

Use Ship Gate when the user asks for:

- `ship`,
- `gstack-ship`,
- `可以 push 并提 PR`,
- `开 PR 到 dev`,
- or similar wording that explicitly asks Codex to publish the change.

Ship Gate runs the same deterministic checks and three reviewer perspectives. Only a final `GO` authorizes commit, push, and PR creation. Any blocker stops the workflow before publish actions.

## Test Selection Strategy

Do not treat full gates as the default feedback loop. Choose the smallest deterministic check that can prove the change, then widen only when the behavioral surface widens.

Small fast check:

```bash
pnpm vitest run path/to/file.test.ts
pnpm vitest run path/to/file.test.ts -t "case name"
```

Use this for pure functions, provider prompts, normalization logic, CSS-adjacent behavior, and small component logic where one test file or case directly covers the change.

Local regression:

```bash
pnpm vitest run tests/api/generationJobs.test.ts
pnpm typecheck
pnpm lint
```

Use this for routes, server services, data contracts, provider boundaries, or user-visible behavior changes. Add `typecheck`, `lint`, or both when the change crosses TypeScript or style boundaries.

Delivery gate:

```bash
pnpm test
pnpm test:api
pnpm test:e2e
pnpm typecheck
pnpm lint
```

Use this before review, ship, PR, or merge, or when the diff spans enough surfaces that targeted tests no longer give good confidence.

Core rule: small changes run the nearest deterministic test first; behavior-boundary changes run the related API or integration tests; delivery runs the full gate. Do not make full checks part of every inner-loop step. During development, prefer serial targeted commands for clearer failures; reserve parallel `vitest`, `typecheck`, and `lint` runs for final gate waiting.

## Progressive Deterministic Gates

StoryCam uses four deterministic gate levels. Run the lowest gate that matches the moment:

```bash
scripts/check-local.sh
```

Local pre-push gate. Runs lint, typecheck, and unit tests. It is intentionally fast and does not run build, E2E, or visual QA.

```bash
scripts/check-pr.sh
```

PR fast gate. Runs the local gate plus production build. GitHub runs this for pull requests into `dev` and `main`.

```bash
scripts/check-dev.sh
```

Dev integration gate. Runs the PR fast gate plus Playwright E2E and visual QA. GitHub runs this after merges to `dev`.

```bash
scripts/check-release.sh
```

Main release gate. Runs the dev integration gate plus mock verification and dependency audit. GitHub runs this after promotion to `main`.

`scripts/pr-ready.sh` remains as a compatibility alias for the PR fast gate. Set `PR_READY_E2E=1` to run the dev integration gate through that legacy entrypoint.

If deterministic checks fail, stop the PR Gate or Ship Gate. Fix the hard failure first; do not spend AI review on a known broken diff.

## Three Reviewer Gate

After deterministic checks pass, run three independent reviewer perspectives:

- `code-reviewer`: use `docs/pr-reviewers/code-reviewer.md`.
- `security-auditor`: use `docs/pr-reviewers/security-auditor.md`.
- `test-engineer`: use `docs/pr-reviewers/test-engineer.md`.

Each reviewer is read-only. It must inspect the current diff and relevant context, produce its own report, and avoid calling the other reviewer perspectives. If the current client supports subagents and the user explicitly requested PR Gate or Ship Gate, run the three reviewers in parallel. If not, run the three reviewer prompts sequentially, but keep the reports separate.

Every reviewer report must include:

- `Verdict: PASS | WARN | BLOCK`,
- `Findings`,
- `Required fixes`,
- `Recommended fixes`,
- `Test gaps`,
- `Accepted risks`.

Critical or High security findings are blockers unless the project owner explicitly accepts the risk.

## Merge Decision

The main agent owns the final decision. Merge the three reports into one summary with:

- deterministic checks and results,
- the three reviewer verdicts,
- blockers that must be fixed before merge,
- recommended fixes,
- accepted risks,
- verification evidence,
- coverage gaps,
- rollback notes,
- final `GO` or `NO-GO`.

If any reviewer returns `BLOCK`, the merged decision is `NO-GO` until the blocker is fixed or explicitly accepted by the project owner. After fixes, rerun the relevant deterministic checks and reviewer perspective; before publishing, rerun the full gate when practical.

## Ship Actions

Ship Gate may continue to commit, push, and create a PR only after the merge decision is `GO`.

The PR body must include:

- deterministic check evidence,
- a summary of all three reviewer reports,
- the final gate mode and decision,
- accepted risks,
- rollback notes.

## Optional Local Git Hook

Local hooks are optional because they only affect one machine. To opt in:

```bash
git config core.hooksPath .githooks
```

The pre-push hook runs `scripts/check-local.sh`. Keep the hook deterministic, fast, and free of AI calls. Heavier checks belong in PR/dev/main CI.

## Codex Project Hook

StoryCam includes a repo-local Codex hook in `.codex/hooks.json`, but Codex hooks are disabled by default in `.codex/config.toml`.

Prefer the Git pre-push hook for local enforcement because it triggers on the exact operation that matters instead of on every Codex shell tool call. To opt in to the Codex context reminder, set `codex_hooks = true` locally.

When Codex itself runs a StoryCam `git push` and the push appears to succeed, the hook injects a reminder into Codex context: ask whether to run the StoryCam PR gate now. The hook does not run the AI review automatically.

The hook is intentionally quiet for normal tool use. `PostToolUse` checks the current tool command directly and only emits context after a successful `git push`. `PreToolUse` remains as a compatibility fallback for Codex clients that do not include the original tool input in post-tool payloads.

The hook suppresses duplicate reminders for the same `HEAD` by writing a marker under the local `.git/` directory.

This is project-scoped Codex context, not a replacement for CI and not an automatic AI review. It does not run when you push from a normal terminal outside Codex; terminal-only pushes rely on the Git pre-push hook reminder.

## GitHub CI Gate

GitHub Actions runs progressive gates:

- Pull requests into `dev` or `main`: `scripts/check-pr.sh`.
- Pushes to `dev`: `scripts/check-dev.sh`.
- Pushes to `main`: `scripts/check-release.sh`.

All CI gates run in mock provider mode. Real OpenRouter, Inference.sh, Seedance, or other provider smoke tests remain manual opt-in checks.

Failed CI output should be fed back to Codex with the failing command and relevant log excerpt. Use `debugging-and-error-recovery`: reproduce, localize, reduce, fix root cause, add or update regression coverage, and rerun the failing gate.

## StoryCam-Specific Review Triggers

Always require the security-auditor perspective for changes touching:

- Supabase Auth,
- RLS policies,
- private Storage buckets,
- signed URLs,
- provider API keys,
- provider request/response logging,
- raw private user input,
- uploads or sharing.

Always require reliability scrutiny for changes touching:

- async generation jobs,
- idempotency,
- polling,
- timeout,
- cancel/tombstone,
- late-result discard,
- provider retries,
- final work composition.

Always require browser evidence for changes touching:

- the story idea input,
- story-world confirmation,
- storyboard groups,
- expansion canvas,
- clip generation,
- final work review.
