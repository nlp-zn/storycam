# PR Review Gate

Status: active quality contract.

## Goal

Every StoryCam PR should have two kinds of evidence before merge:

- deterministic checks from CI or `scripts/pr-ready.sh`,
- Codex review evidence from three independent perspectives.

Deterministic checks block mechanically. Codex review catches product, architecture, security, reliability, and test gaps that raw commands miss.

## Local Pre-PR Check

Run the fast deterministic gate before opening a PR:

```bash
scripts/pr-ready.sh
```

For UI or browser-flow changes, run the full local browser gate:

```bash
PR_READY_E2E=1 scripts/pr-ready.sh
```

The script runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

With `PR_READY_E2E=1`, it also runs:

```bash
pnpm test:e2e
```

## Optional Local Git Hook

Local hooks are optional because they only affect one machine. To opt in:

```bash
git config core.hooksPath .githooks
```

The pre-push hook runs `scripts/pr-ready.sh`. Keep the hook deterministic; do not make it call an AI model.

## Codex Project Hook

StoryCam also includes a repo-local Codex hook in `.codex/hooks.json`.

When Codex itself runs a StoryCam `git push`, the hook injects a reminder to ask whether to run the Codex PR gate. This is project-scoped Codex context, not a replacement for CI and not an automatic AI review. It does not run when you push from a normal terminal outside Codex.

The hook requires Codex hooks to be enabled, which is declared in `.codex/config.toml`.

## Codex PR Gate

Before opening or merging a meaningful PR, ask Codex:

```text
Run the StoryCam PR gate on the current diff.

Use three independent review perspectives:
1. code-reviewer: correctness, readability, architecture, security, performance
2. security-auditor: auth, RLS, storage, provider secrets, logs, signed URLs, external inputs
3. test-engineer: test coverage, edge cases, error paths, concurrency, E2E needs

Merge the reports into GO/NO-GO with:
- blockers that must be fixed before merge,
- recommended fixes,
- accepted risks,
- verification commands and results,
- rollback plan for production-bound changes.
```

Critical or High security findings are merge blockers unless the project owner explicitly accepts the risk.

## GitHub CI Gate

GitHub Actions runs on `main`, `dev`, and PRs into those branches:

- lint,
- typecheck,
- unit tests,
- build,
- Playwright E2E in mock provider mode.

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
