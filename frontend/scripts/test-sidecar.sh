#!/usr/bin/env bash
# Runs the local-runtime Python test workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
"$ROOT/scripts/python-in-env.sh" local-runtime python -m pytest tests/sidecar "$@"
