#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BUNDLE_ID="${WINDIE_BUNDLE_ID:-com.windieos.desktop}"
DEFAULT_BUNDLE_IDS=(
  "${BUNDLE_ID}"
  "${BUNDLE_ID}.helper"
  "${BUNDLE_ID}.helper.Renderer"
  "${BUNDLE_ID}.helper.GPU"
  "${BUNDLE_ID}.helper.Plugin"
)
TCC_SERVICES=(
  All
  ScreenCapture
  Accessibility
  Microphone
  Camera
  AppleEvents
  AppManagement
  SystemPolicyAllFiles
)
NOTARIZATION_ENV_VARS=(
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
  APPLE_API_KEY
  APPLE_API_KEY_ID
  APPLE_API_ISSUER
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
TAIL_PID=""

cleanup_tail() {
  if [[ -n "${TAIL_PID}" ]]; then
    kill "${TAIL_PID}" >/dev/null 2>&1 || true
    wait "${TAIL_PID}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  cleanup_tail
}

trap cleanup EXIT

run_frontend_local_build_cmd() {
  "${ROOT_DIR}/scripts/python-in-env" frontend env \
    -u APPLE_ID \
    -u APPLE_APP_SPECIFIC_PASSWORD \
    -u APPLE_TEAM_ID \
    -u APPLE_API_KEY \
    -u APPLE_API_KEY_ID \
    -u APPLE_API_ISSUER \
    WINDIE_PYTHON_BUILD="${PYTHON_BUILD}" \
    "$@"
}

collect_existing_install_paths() {
  shopt -s nullglob
  local install_candidates=(
    "${APP_INSTALL_PATH}"
    /Applications/WindieOS.app.pre-*
    /Applications/WindieOS.app.pre-codex-*
    /Applications/WindieOS.app.pre-test-*
  )
  shopt -u nullglob
  printf '%s\n' "${install_candidates[@]}"
}

collect_windie_bundle_ids() {
  {
    printf '%s\n' "${DEFAULT_BUNDLE_IDS[@]}"

    while IFS= read -r app_path; do
      [[ -d "${app_path}" ]] || continue

      while IFS= read -r plist_path; do
        /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${plist_path}" 2>/dev/null || true
      done < <(find "${app_path}" -path '*/Contents/Info.plist' -print)
    done < <(collect_existing_install_paths)
  } | sed '/^[[:space:]]*$/d' | sort -u
}

reset_windie_tcc_permissions() {
  local bundle_id
  local service

  while IFS= read -r bundle_id; do
    [[ -n "${bundle_id}" ]] || continue
    echo "[reinstall-windieos-macos] resetting TCC grants for ${bundle_id}"
    for service in "${TCC_SERVICES[@]}"; do
      tccutil reset "${service}" "${bundle_id}" >/dev/null 2>&1 || true
    done
  done < <(collect_windie_bundle_ids)
}

echo "[reinstall-windieos-macos] repo=${ROOT_DIR}"
echo "[reinstall-windieos-macos] frontend=${FRONTEND_DIR}"
echo "[reinstall-windieos-macos] bundle_id=${BUNDLE_ID}"
echo "[reinstall-windieos-macos] app_install_path=${APP_INSTALL_PATH}"
echo "[reinstall-windieos-macos] user_data_dir=${USER_DATA_DIR}"
echo "[reinstall-windieos-macos] log_file=${LOG_FILE}"
echo "[reinstall-windieos-macos] sidecar_log_level=${SIDECAR_LOG_LEVEL}"
echo "[reinstall-windieos-macos] local reinstall skips Apple notarization and ignores: ${NOTARIZATION_ENV_VARS[*]}"

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

echo "[reinstall-windieos-macos] resetting all known macOS privacy permissions for prior WindieOS installs"
reset_windie_tcc_permissions

echo "[reinstall-windieos-macos] removing old installed copies and local app state"
shopt -s nullglob
old_installs=(
  "${APP_INSTALL_PATH}"
  /Applications/WindieOS.app.pre-*
  /Applications/WindieOS.app.pre-codex-*
  /Applications/WindieOS.app.pre-test-*
)
shopt -u nullglob
if (( ${#old_installs[@]} > 0 )); then
  rm -rf "${old_installs[@]}"
fi

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

echo "[reinstall-windieos-macos] building fresh local macOS app bundle (no Apple notarization)"
run_frontend_local_build_cmd npm --prefix "${FRONTEND_DIR}" run build:sidecar-runtime
run_frontend_local_build_cmd npm --prefix "${FRONTEND_DIR}" run build
run_frontend_local_build_cmd \
  "${FRONTEND_DIR}/node_modules/.bin/electron-builder" \
  --config electron-builder.bundled-python.yml \
  --mac dir

APP_SOURCE_PATH="${FRONTEND_DIR}/release/mac-arm64/${APP_NAME}"
if [[ ! -d "${APP_SOURCE_PATH}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: failed to locate built app bundle at ${APP_SOURCE_PATH}" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] installing ${APP_SOURCE_PATH} -> ${APP_INSTALL_PATH}"
ditto "${APP_SOURCE_PATH}" "${APP_INSTALL_PATH}"
xattr -d com.apple.quarantine "${APP_INSTALL_PATH}" >/dev/null 2>&1 || true
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
