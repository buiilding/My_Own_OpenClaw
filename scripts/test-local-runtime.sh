#!/usr/bin/env bash
# Runs the local-runtime Python test workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
if [[ "$*" == *frontend/tests/sidecar* ]]; then
  "$ROOT/scripts/python-in-env.sh" local-runtime python -m pytest "$@"
else
  "$ROOT/scripts/python-in-env.sh" local-runtime python -m pytest frontend/tests/sidecar "$@"
fi
