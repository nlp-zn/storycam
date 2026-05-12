#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/check-pr.sh"

echo "==> pnpm test:e2e"
pnpm test:e2e

echo "==> pnpm qa:visual"
pnpm qa:visual
