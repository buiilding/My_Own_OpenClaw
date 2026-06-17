#!/usr/bin/env bash
# Runs the run backend workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
exec "$ROOT/scripts/python-in-env.sh" backend python -m backend.src.main "$@"
