#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Enable it with: corepack enable"
  exit 1
fi

echo "==> pnpm lint"
pnpm lint

echo "==> pnpm typecheck"
pnpm typecheck

echo "==> pnpm test"
pnpm test

echo "==> pnpm build"
pnpm build

if [ "${PR_READY_E2E:-0}" = "1" ]; then
  echo "==> pnpm test:e2e"
  pnpm test:e2e
else
  echo "==> skipped e2e; run PR_READY_E2E=1 scripts/pr-ready.sh for full local browser verification"
fi

cat <<'MSG'

Deterministic checks passed.

Before opening or merging a PR, run the Codex PR gate:
  code-reviewer + security-auditor + test-engineer

Ask Codex:
  Run the StoryCam PR gate on the current diff and return GO/NO-GO with blockers,
  recommended fixes, verification evidence, coverage gaps, and rollback plan.
MSG
