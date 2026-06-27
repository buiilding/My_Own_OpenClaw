#!/usr/bin/env bash
# Runs the frontend customer Electron workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
echo "[WindieOS] Customer launcher -> npm run electron"
exec "$ROOT/scripts/python-in-env.sh" frontend npm --prefix "$ROOT" run electron -- "$@"
