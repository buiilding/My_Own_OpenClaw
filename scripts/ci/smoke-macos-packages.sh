#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/frontend/release"

DMG_ARTIFACT="$(ls -1t "${RELEASE_DIR}"/*.dmg 2>/dev/null | head -n 1)"
[[ -n "${DMG_ARTIFACT}" ]] || { echo "Missing .dmg artifact" >&2; exit 1; }

ATTACH_OUTPUT="$(hdiutil attach "${DMG_ARTIFACT}" -nobrowse)"
MOUNT_POINT="$(echo "${ATTACH_OUTPUT}" | awk '/\/Volumes\// { print substr($0, index($0, "/Volumes/")); exit }')"
[[ -n "${MOUNT_POINT}" ]] || { echo "Unable to determine DMG mount point." >&2; exit 1; }

APP_IN_DMG="$(find "${MOUNT_POINT}" -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "${APP_IN_DMG}" ]] || { echo "No .app found in mounted DMG." >&2; exit 1; }

INSTALLED_APP="/Applications/$(basename "${APP_IN_DMG}")"
cp -R "${APP_IN_DMG}" /Applications/

BINARY_PATH="${INSTALLED_APP}/Contents/MacOS/WindieOS"
if [[ ! -x "${BINARY_PATH}" ]]; then
  BINARY_PATH="$(find "${INSTALLED_APP}/Contents/MacOS" -maxdepth 1 -type f -perm -111 -print -quit)"
fi
[[ -n "${BINARY_PATH}" ]] || { echo "Unable to locate app executable." >&2; exit 1; }

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

hdiutil detach "${MOUNT_POINT}" -quiet || true
rm -rf "${INSTALLED_APP}" || true
