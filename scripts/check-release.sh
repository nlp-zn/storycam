#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/check-dev.sh"

echo "==> pnpm storycam:verify:mock"
pnpm storycam:verify:mock

echo "==> pnpm audit --audit-level high"
pnpm audit --audit-level high
