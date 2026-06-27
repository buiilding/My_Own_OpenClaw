#!/usr/bin/env bash
# Runs the python in env workflow for the developer CLI and automation tooling.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/python-in-env.sh <backend|local-runtime|sidecar|frontend> <command> [args...]" >&2
  exit 2
fi

TARGET="$1"
shift

case "$TARGET" in
  backend)
    ENV_NAME="${WINDIE_BACKEND_ENV:-jarvis}"
    ;;
  local-runtime|sidecar|frontend)
    ENV_NAME="${WINDIE_FRONTEND_ENV:-frontend_jarvis}"
    ;;
  *)
    echo "Unknown target '$TARGET'. Use backend, local-runtime, sidecar, or frontend." >&2
    exit 2
    ;;
esac

if command -v conda >/dev/null 2>&1; then
  if conda run -n "$ENV_NAME" python -c "import sys" >/dev/null 2>&1; then
    case "$TARGET" in
      local-runtime|sidecar|frontend)
        ENV_PYTHON="$(conda run -n "$ENV_NAME" python -c "import sys; print(sys.executable)" 2>/dev/null | tail -n 1 || true)"
        if [ -n "$ENV_PYTHON" ]; then
          export WINDIE_PYTHON_PATH="$ENV_PYTHON"
        fi
        ;;
    esac
    exec conda run --no-capture-output -n "$ENV_NAME" "$@"
  fi
fi

echo "[python-in-env] Conda env '$ENV_NAME' unavailable; using current shell environment." >&2
exec "$@"
