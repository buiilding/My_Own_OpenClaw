#!/usr/bin/env bash
# Runs the run frontend electron workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
echo "[WindieOS] Developer launcher -> npm run electron:dev"
exec "$ROOT/scripts/python-in-env.sh" frontend npm --prefix "$ROOT" run electron:dev -- "$@"
