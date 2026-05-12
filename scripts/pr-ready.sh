#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${PR_READY_E2E:-0}" = "1" ]; then
  "$ROOT/scripts/check-dev.sh"
else
  "$ROOT/scripts/check-pr.sh"
  echo "==> skipped dev browser gate; run PR_READY_E2E=1 scripts/pr-ready.sh for E2E and visual QA"
fi

cat <<'MSG'

Deterministic checks passed.

Before opening or merging a PR, run the Codex PR gate:
  produce three independent reviewer reports from:
  1. code-reviewer: docs/pr-reviewers/code-reviewer.md
  2. security-auditor: docs/pr-reviewers/security-auditor.md
  3. test-engineer: docs/pr-reviewers/test-engineer.md

Ask Codex:
  Run the StoryCam PR gate on the current diff. Merge the three reviewer reports
  into GO/NO-GO with deterministic evidence, reviewer verdicts, blockers,
  recommended fixes, accepted risks, coverage gaps, verification evidence,
  and rollback notes.
MSG
