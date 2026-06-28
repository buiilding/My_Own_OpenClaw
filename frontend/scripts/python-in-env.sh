#!/usr/bin/env bash
# Runs the python in env workflow for the developer CLI and automation tooling.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/python-in-env.sh <backend|local-runtime|sidecar|frontend> <command> [args...]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

if [[ "$TARGET" == "local-runtime" || "$TARGET" == "sidecar" || "$TARGET" == "frontend" ]]; then
  case "${1:-}" in
    python|python3|python.exe)
      for runtime_python in \
        "${ROOT_DIR}/python-runtime/python.exe" \
        "${ROOT_DIR}/python-runtime/bin/python3" \
        "${ROOT_DIR}/python-runtime/bin/python" \
        "${ROOT_DIR}/python-runtime/Scripts/python.exe"; do
        if [[ -x "${runtime_python}" ]]; then
          export WINDIE_PYTHON_PATH="${runtime_python}"
          echo "[python-in-env] Conda env '${ENV_NAME}' unavailable; using generated frontend runtime: ${runtime_python}" >&2
          shift
          exec "${runtime_python}" "$@"
        fi
      done
      ;;
  esac
fi

echo "[python-in-env] Conda env '$ENV_NAME' unavailable; using current shell environment." >&2
exec "$@"
