#!/usr/bin/env bash
# Runs the windie workflow for WindieOS on Unix-like shells.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${REPO_ROOT}/scripts/windie-cli.cjs" "$@"
