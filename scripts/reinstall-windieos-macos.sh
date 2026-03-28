#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BUNDLE_ID="${WINDIE_BUNDLE_ID:-com.windieos.desktop}"
BUNDLE_IDS=(
  "${BUNDLE_ID}"
  "${BUNDLE_ID}.helper"
  "${BUNDLE_ID}.helper.Renderer"
  "${BUNDLE_ID}.helper.GPU"
  "${BUNDLE_ID}.helper.Plugin"
)
APP_NAME="${WINDIE_APP_NAME:-WindieOS.app}"
APP_INSTALL_PATH="/Applications/${APP_NAME}"
USER_DATA_DIR="${HOME}/Library/Application Support/WindieOS"
APP_SUPPORT_BUNDLE_DIR="${HOME}/Library/Application Support/${BUNDLE_ID}"
CACHE_DIR="${HOME}/Library/Caches/WindieOS"
CACHE_BUNDLE_DIR="${HOME}/Library/Caches/${BUNDLE_ID}"
WEBKIT_DIR="${HOME}/Library/WebKit/WindieOS"
WEBKIT_BUNDLE_DIR="${HOME}/Library/WebKit/${BUNDLE_ID}"
HTTP_STORAGE_DIR="${HOME}/Library/HTTPStorages/${BUNDLE_ID}"
SAVED_STATE_DIR="${HOME}/Library/Saved Application State/${BUNDLE_ID}.savedState"
LOG_FILE="${WINDIE_LOG_FILE:-${HOME}/windieos-packaged-run.log}"
SIDECAR_LOG_LEVEL="${WINDIE_SIDECAR_LOG_LEVEL:-ERROR}"
PYTHON_BUILD="${WINDIE_PYTHON_BUILD:-}"
MOUNT_POINT=""
TAIL_PID=""

cleanup_mount() {
  if [[ -n "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" >/dev/null 2>&1 || true
  fi
}

cleanup_tail() {
  if [[ -n "${TAIL_PID}" ]]; then
    kill "${TAIL_PID}" >/dev/null 2>&1 || true
    wait "${TAIL_PID}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  cleanup_tail
  cleanup_mount
}

trap cleanup EXIT

echo "[reinstall-windieos-macos] repo=${ROOT_DIR}"
echo "[reinstall-windieos-macos] frontend=${FRONTEND_DIR}"
echo "[reinstall-windieos-macos] bundle_id=${BUNDLE_ID}"
echo "[reinstall-windieos-macos] app_install_path=${APP_INSTALL_PATH}"
echo "[reinstall-windieos-macos] user_data_dir=${USER_DATA_DIR}"
echo "[reinstall-windieos-macos] log_file=${LOG_FILE}"
echo "[reinstall-windieos-macos] sidecar_log_level=${SIDECAR_LOG_LEVEL}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[reinstall-windieos-macos] ERROR: this script only supports macOS" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[reinstall-windieos-macos] ERROR: npm is required" >&2
  exit 1
fi

if [[ -z "${PYTHON_BUILD}" ]]; then
  PYTHON_BUILD="$("${ROOT_DIR}/scripts/python-in-env" frontend python -c 'import sys; print(sys.executable)')"
fi

if [[ ! -x "${PYTHON_BUILD}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: python build interpreter not found: ${PYTHON_BUILD}" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] python_build=${PYTHON_BUILD}"

echo "[reinstall-windieos-macos] stopping running WindieOS processes"
pkill -f "${APP_INSTALL_PATH}/Contents/MacOS/WindieOS" || true
pkill -f '/WindieOS.app/Contents/MacOS/WindieOS' || true

echo "[reinstall-windieos-macos] resetting macOS privacy permissions for WindieOS bundles"
for bundle in "${BUNDLE_IDS[@]}"; do
  for service in All ScreenCapture Accessibility Microphone AppleEvents AppManagement; do
    tccutil reset "${service}" "${bundle}" >/dev/null 2>&1 || true
  done
done

echo "[reinstall-windieos-macos] removing old installed copies and local app state"
shopt -s nullglob
old_installs=(
  "${APP_INSTALL_PATH}"
  /Applications/WindieOS.app.pre-*
  /Applications/WindieOS.app.pre-codex-*
  /Applications/WindieOS.app.pre-test-*
)
if (( ${#old_installs[@]} > 0 )); then
  rm -rf "${old_installs[@]}"
fi
shopt -u nullglob

rm -rf \
  "${USER_DATA_DIR}" \
  "${APP_SUPPORT_BUNDLE_DIR}" \
  "${CACHE_DIR}" \
  "${CACHE_BUNDLE_DIR}" \
  "${WEBKIT_DIR}" \
  "${WEBKIT_BUNDLE_DIR}" \
  "${HTTP_STORAGE_DIR}" \
  "${SAVED_STATE_DIR}"
rm -f "${LOG_FILE}"

echo "[reinstall-windieos-macos] cleaning previous build artifacts"
rm -rf \
  "${FRONTEND_DIR}/dist" \
  "${FRONTEND_DIR}/release" \
  "${FRONTEND_DIR}/python-runtime" \
  "${FRONTEND_DIR}/python-runtime.tar.gz"

echo "[reinstall-windieos-macos] building fresh macOS package"
"${ROOT_DIR}/scripts/python-in-env" frontend env \
  WINDIE_PYTHON_BUILD="${PYTHON_BUILD}" \
  npm --prefix "${FRONTEND_DIR}" run package:mac:bundled-python

DMG_PATH="$(ls -t "${FRONTEND_DIR}"/release/WindieOS-*-arm64.dmg 2>/dev/null | head -n 1)"
if [[ -z "${DMG_PATH}" || ! -f "${DMG_PATH}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: no macOS DMG found under ${FRONTEND_DIR}/release" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] mounting ${DMG_PATH}"
MOUNT_POINT="$(hdiutil attach "${DMG_PATH}" -nobrowse | awk '/\/Volumes\// { print substr($0, index($0, "/Volumes/")); exit }')"
if [[ -z "${MOUNT_POINT}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: failed to mount ${DMG_PATH}" >&2
  exit 1
fi

APP_SOURCE_PATH="$(find "${MOUNT_POINT}" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "${APP_SOURCE_PATH}" || ! -d "${APP_SOURCE_PATH}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: failed to locate app bundle inside ${MOUNT_POINT}" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] installing ${APP_SOURCE_PATH} -> ${APP_INSTALL_PATH}"
ditto "${APP_SOURCE_PATH}" "${APP_INSTALL_PATH}"
chmod -R u+w "${APP_INSTALL_PATH}" >/dev/null 2>&1 || true
xattr -dr com.apple.quarantine "${APP_INSTALL_PATH}" >/dev/null 2>&1 || true
open -R "${APP_INSTALL_PATH}"
open -a Finder /Applications

echo "[reinstall-windieos-macos] launching installed packaged app via LaunchServices with live logs"
echo "[reinstall-windieos-macos] tip: browser runtime decisions show up as [BrowserRuntime] lines"
: > "${LOG_FILE}"
tail -n +1 -F "${LOG_FILE}" &
TAIL_PID=$!

open -n -W -F \
  --stdin /dev/null \
  --stdout "${LOG_FILE}" \
  --stderr "${LOG_FILE}" \
  --env "WINDIE_SIDECAR_LOG_LEVEL=${SIDECAR_LOG_LEVEL}" \
  --env "WINDIE_VERBOSE_SIDECAR_STDERR=0" \
  "${APP_INSTALL_PATH}"
