#!/usr/bin/env bash
# Runs the docs list workflow for the WindieOS on Unix-like shells.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${REPO_ROOT}/scripts/docs-list.js" "$@"
