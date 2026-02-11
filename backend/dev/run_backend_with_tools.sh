#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

profile="${1:-}"
if [[ -z "$profile" ]]; then
  cat <<'USAGE'
Usage:
  backend/dev/run_backend_with_tools.sh <profile> [extra python args...]

Profiles:
  full
  coding
  computer
  browser

Example:
  backend/dev/run_backend_with_tools.sh coding
USAGE
  exit 1
fi

case "$profile" in
  full|coding|computer|browser) ;;
  *)
    echo "Unknown profile: $profile" >&2
    echo "Expected one of: full, coding, computer, browser" >&2
    exit 1
    ;;
esac

selection_file="$ROOT_DIR/backend/dev/tool_selection.${profile}.toml"
if [[ ! -f "$selection_file" ]]; then
  echo "Missing profile file: $selection_file" >&2
  exit 1
fi

shift
export WINDIEOS_DEV_TOOL_SELECTION_PATH="$selection_file"

cd "$ROOT_DIR"
exec python -m backend.src.main "$@"
