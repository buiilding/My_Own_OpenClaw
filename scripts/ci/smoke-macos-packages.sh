#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/frontend/release"
INSTALLED_APP=""
MOUNT_POINT=""
APP_PID=""

cleanup() {
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  if [[ -n "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
  if [[ -n "${INSTALLED_APP}" ]]; then
    rm -rf "${INSTALLED_APP}" || true
  fi
}

trap cleanup EXIT

validate_downloaded_app="${WINDIE_VALIDATE_DOWNLOADED_APP:-false}"

DMG_ARTIFACT="$(ls -1t "${RELEASE_DIR}"/*.dmg 2>/dev/null | head -n 1)"
[[ -n "${DMG_ARTIFACT}" ]] || { echo "Missing .dmg artifact" >&2; exit 1; }

ATTACH_OUTPUT="$(hdiutil attach "${DMG_ARTIFACT}" -nobrowse)"
MOUNT_POINT="$(echo "${ATTACH_OUTPUT}" | awk '/\/Volumes\// { print substr($0, index($0, "/Volumes/")); exit }')"
[[ -n "${MOUNT_POINT}" ]] || { echo "Unable to determine DMG mount point." >&2; exit 1; }

APP_IN_DMG="$(find "${MOUNT_POINT}" -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "${APP_IN_DMG}" ]] || { echo "No .app found in mounted DMG." >&2; exit 1; }

INSTALLED_APP="/Applications/$(basename "${APP_IN_DMG}")"
rm -rf "${INSTALLED_APP}"
ditto "${APP_IN_DMG}" "${INSTALLED_APP}"

BINARY_PATH="${INSTALLED_APP}/Contents/MacOS/WindieOS"
if [[ ! -x "${BINARY_PATH}" ]]; then
  BINARY_PATH="$(find "${INSTALLED_APP}/Contents/MacOS" -maxdepth 1 -type f -perm -111 -print -quit)"
fi
[[ -n "${BINARY_PATH}" ]] || { echo "Unable to locate app executable." >&2; exit 1; }

if [[ "${validate_downloaded_app}" == "true" ]]; then
  quarantine_value="0083;$(date +%s);WindieOS CI;$(uuidgen)"
  xattr -r -w com.apple.quarantine "${quarantine_value}" "${INSTALLED_APP}"

  if ! spctl --assess --type execute --verbose=4 "${INSTALLED_APP}" >/tmp/windieos-macos-gatekeeper.log 2>&1; then
    cat /tmp/windieos-macos-gatekeeper.log >&2
    echo "Gatekeeper rejected the installed app bundle under a download-style quarantine check." >&2
    exit 1
  fi

  open -n "${INSTALLED_APP}" >/tmp/windieos-macos-open.log 2>&1 || {
    cat /tmp/windieos-macos-open.log >&2
    echo "LaunchServices failed to open the installed app bundle." >&2
    exit 1
  }

  for _ in {1..20}; do
    APP_PID="$(pgrep -f "${INSTALLED_APP}/Contents/MacOS" | head -n 1 || true)"
    if [[ -n "${APP_PID}" ]]; then
      break
    fi
    sleep 1
  done

  if [[ -z "${APP_PID}" ]]; then
    echo "LaunchServices never started the installed app bundle after quarantine validation." >&2
    exit 1
  fi
fi

"${BINARY_PATH}" --version >/tmp/windieos-macos-smoke.log 2>&1 &
PID=$!
sleep 10
if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" 2>/dev/null || true
fi
wait "${PID}" 2>/dev/null || true

if [[ "${WINDIE_REQUIRE_SIGNING:-false}" == "true" ]]; then
  codesign --verify --deep --strict --verbose=2 "${INSTALLED_APP}"
fi
