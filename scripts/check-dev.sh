#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/check-pr.sh"

echo "==> pnpm test:e2e"
STORYCAM_E2E_REUSE_SERVER=0 pnpm test:e2e

echo "==> pnpm qa:visual"
STORYCAM_E2E_REUSE_SERVER=0 pnpm qa:visual
