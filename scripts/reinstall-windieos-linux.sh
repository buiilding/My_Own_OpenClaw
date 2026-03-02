#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
PYTHON_BUILD_DEFAULT="/home/peter/miniconda3/envs/frontend_jarvis/bin/python"
PYTHON_BUILD="${WINDIE_PYTHON_BUILD:-${PYTHON_BUILD_DEFAULT}}"
CONDA_ENV="${WINDIE_CONDA_ENV:-frontend_jarvis}"

echo "[reinstall-windieos-linux] repo=${ROOT_DIR}"
echo "[reinstall-windieos-linux] frontend=${FRONTEND_DIR}"
echo "[reinstall-windieos-linux] conda_env=${CONDA_ENV}"
echo "[reinstall-windieos-linux] python_build=${PYTHON_BUILD}"

if [[ ! -x "${PYTHON_BUILD}" ]]; then
  echo "[reinstall-windieos-linux] ERROR: python build interpreter not found: ${PYTHON_BUILD}" >&2
  exit 1
fi

if ! command -v conda >/dev/null 2>&1; then
  echo "[reinstall-windieos-linux] ERROR: conda not found on PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[reinstall-windieos-linux] ERROR: npm not found on PATH" >&2
  exit 1
fi

if ! command -v apt >/dev/null 2>&1; then
  echo "[reinstall-windieos-linux] ERROR: apt not found; this script is for Debian/Ubuntu Linux only" >&2
  exit 1
fi

cd "${FRONTEND_DIR}"

echo "[reinstall-windieos-linux] stopping running app (if present)"
pkill -f '(^|/)windieos($| )' || true

echo "[reinstall-windieos-linux] uninstalling previous packages"
sudo apt purge -y windieos desktop-assistant-frontend || true
sudo apt autoremove -y || true

echo "[reinstall-windieos-linux] cleaning previous build artifacts"
rm -rf release dist python-runtime python-runtime.tar.gz

echo "[reinstall-windieos-linux] installing frontend dependencies"
conda run -n "${CONDA_ENV}" npm ci

echo "[reinstall-windieos-linux] building linux bundled-python package"
conda run -n "${CONDA_ENV}" env WINDIE_PYTHON_BUILD="${PYTHON_BUILD}" npm run package:linux:bundled-python

DEB_PATH="$(ls -t "${FRONTEND_DIR}"/release/windieos_*_amd64.deb | head -n 1)"
if [[ -z "${DEB_PATH}" || ! -f "${DEB_PATH}" ]]; then
  echo "[reinstall-windieos-linux] ERROR: no .deb package found in ${FRONTEND_DIR}/release" >&2
  exit 1
fi

echo "[reinstall-windieos-linux] installing ${DEB_PATH}"
sudo apt install -y "${DEB_PATH}"

echo "[reinstall-windieos-linux] runtime verification"
/opt/WindieOS/resources/python-runtime/bin/python3 - <<'PY'
import sys
try:
    import _tkinter
except Exception as exc:
    print(f"_tkinter: fail ({exc})")
    raise SystemExit(1)

print(f"python: {sys.version.split()[0]}")
print("_tkinter: ok")
PY

echo "[reinstall-windieos-linux] done"
