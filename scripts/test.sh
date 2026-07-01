#!/usr/bin/env bash
# Covers module behavior in the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(
  cd "$ROOT"
  "$ROOT/scripts/test-backend.sh"
  "$ROOT/scripts/test-local-runtime.sh"
)

if [ -d "$ROOT/frontend" ]; then
  if [ -d "$ROOT/frontend/node_modules" ]; then
    (
      cd "$ROOT/frontend"
      npm run test:ci
    )
  else
    echo "Skipping frontend tests (frontend/node_modules missing)."
  fi
fi
