#!/usr/bin/env bash
# Runs the reinstall windieos macos workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR=""
RUNTIME_DIR="${FRONTEND_DIR}/python-runtime"
RUNTIME_ARCHIVE="${FRONTEND_DIR}/python-runtime.tar.gz"
RUNTIME_REQS="${FRONTEND_DIR}/src/main/python/requirements.runtime.txt"
RUNTIME_BUILD_SCRIPT="${ROOT_DIR}/scripts/build-sidecar-runtime.sh"
RUNTIME_BUILD_STAMP="${FRONTEND_DIR}/.windie-python-runtime-build-stamp"
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
LOCAL_SIGNING_ENV_VARS=(
  CSC_LINK
  CSC_KEY_PASSWORD
  CSC_IDENTITY_AUTO_DISCOVERY
)
APP_NAME="${WINDIE_APP_NAME:-WindieOS.app}"
APP_INSTALL_PATH="/Applications/${APP_NAME}"
USER_DATA_DIR="${HOME}/Library/Application Support/windieos"
APP_SUPPORT_BUNDLE_DIR="${HOME}/Library/Application Support/${BUNDLE_ID}"
CACHE_DIR="${HOME}/Library/Caches/windieos"
CACHE_BUNDLE_DIR="${HOME}/Library/Caches/${BUNDLE_ID}"
WEBKIT_DIR="${HOME}/Library/WebKit/windieos"
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
  "${ROOT_DIR}/scripts/python-in-env.sh" frontend env \
    -u APPLE_ID \
    -u APPLE_APP_SPECIFIC_PASSWORD \
    -u APPLE_TEAM_ID \
    -u APPLE_API_KEY \
    -u APPLE_API_KEY_ID \
    -u APPLE_API_ISSUER \
    -u CSC_LINK \
    -u CSC_KEY_PASSWORD \
    CSC_IDENTITY_AUTO_DISCOVERY=false \
    WINDIE_PYTHON_BUILD="${PYTHON_BUILD}" \
    "$@"
}

compute_runtime_build_key() {
  local python_identity=""
  local input_fingerprint=""

  python_identity="$("${PYTHON_BUILD}" - <<'PY'
from __future__ import annotations

import platform
import sys

print("|".join([
    sys.executable,
    sys.version.split()[0],
    sys.platform,
    platform.machine(),
]))
PY
)"

  input_fingerprint="$(
    shasum -a 256 \
      "${RUNTIME_REQS}" \
      "${RUNTIME_BUILD_SCRIPT}" \
    | shasum -a 256 \
    | awk '{print $1}'
  )"

  printf '%s\n' "${python_identity}|${input_fingerprint}"
}

resolve_runtime_rebuild_reason() {
  local expected_key="$1"

  if [[ ! -d "${RUNTIME_DIR}" ]]; then
    printf '%s\n' "python-runtime is missing"
    return
  fi

  if [[ ! -f "${RUNTIME_BUILD_STAMP}" ]]; then
    printf '%s\n' "python-runtime build stamp is missing"
    return
  fi

  local current_key=""
  current_key="$(tr -d '\n' < "${RUNTIME_BUILD_STAMP}")"
  if [[ "${current_key}" != "${expected_key}" ]]; then
    printf '%s\n' "runtime build inputs changed"
    return
  fi

  printf '%s\n' ""
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
echo "[reinstall-windieos-macos] local reinstall skips Apple notarization and Developer ID signing"
echo "[reinstall-windieos-macos] ignored notarization env vars: ${NOTARIZATION_ENV_VARS[*]}"
echo "[reinstall-windieos-macos] ignored local signing env vars: ${LOCAL_SIGNING_ENV_VARS[*]}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[reinstall-windieos-macos] ERROR: this script only supports macOS" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[reinstall-windieos-macos] ERROR: npm is required" >&2
  exit 1
fi

if [[ -z "${PYTHON_BUILD}" ]]; then
  PYTHON_BUILD="$("${ROOT_DIR}/scripts/python-in-env.sh" frontend python -c 'import sys; print(sys.executable)')"
fi

if [[ ! -x "${PYTHON_BUILD}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: python build interpreter not found: ${PYTHON_BUILD}" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] python_build=${PYTHON_BUILD}"

if [[ ! -f "${RUNTIME_REQS}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: missing runtime requirements file: ${RUNTIME_REQS}" >&2
  exit 1
fi

if [[ ! -f "${RUNTIME_BUILD_SCRIPT}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: missing runtime build script: ${RUNTIME_BUILD_SCRIPT}" >&2
  exit 1
fi

RUNTIME_BUILD_KEY="$(compute_runtime_build_key)"
RUNTIME_REBUILD_REASON="$(resolve_runtime_rebuild_reason "${RUNTIME_BUILD_KEY}")"

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
  "${FRONTEND_DIR}/release"

echo "[reinstall-windieos-macos] building fresh local macOS app bundle (no Apple notarization)"
if [[ -n "${RUNTIME_REBUILD_REASON}" ]]; then
  echo "[reinstall-windieos-macos] rebuilding sidecar runtime because ${RUNTIME_REBUILD_REASON}"
  rm -rf "${RUNTIME_DIR}" "${RUNTIME_ARCHIVE}"
  run_frontend_local_build_cmd npm --prefix "${FRONTEND_DIR}" run build:sidecar-runtime
  printf '%s\n' "${RUNTIME_BUILD_KEY}" > "${RUNTIME_BUILD_STAMP}"
else
  echo "[reinstall-windieos-macos] reusing existing sidecar runtime; runtime build inputs are unchanged"
fi
run_frontend_local_build_cmd npm --prefix "${FRONTEND_DIR}" run build
run_frontend_local_build_cmd \
  bash \
  -lc \
  "cd \"${FRONTEND_DIR}\" && ./node_modules/.bin/electron-builder --config electron-builder.bundled-python.yml -c.mac.identity=null --mac dir"

APP_SOURCE_PATH="${FRONTEND_DIR}/release/mac-arm64/${APP_NAME}"
if [[ ! -d "${APP_SOURCE_PATH}" ]]; then
  echo "[reinstall-windieos-macos] ERROR: failed to locate built app bundle at ${APP_SOURCE_PATH}" >&2
  exit 1
fi

echo "[reinstall-windieos-macos] installing ${APP_SOURCE_PATH} -> ${APP_INSTALL_PATH}"
ditto "${APP_SOURCE_PATH}" "${APP_INSTALL_PATH}"
echo "[reinstall-windieos-macos] applying a consistent ad-hoc signature to the installed app bundle"
codesign --force --deep --sign - "${APP_INSTALL_PATH}"
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
