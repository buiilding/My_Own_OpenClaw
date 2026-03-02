#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/frontend/release"

find_latest() {
  local pattern="$1"
  ls -1t ${pattern} 2>/dev/null | head -n 1
}

launch_check() {
  local cmd=("$@")
  if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run -a "${cmd[@]}" >/tmp/windieos-linux-smoke.log 2>&1 &
  else
    "${cmd[@]}" >/tmp/windieos-linux-smoke.log 2>&1 &
  fi
  local pid=$!
  sleep 10
  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
  fi
  wait "${pid}" 2>/dev/null || true
}

DEB_ARTIFACT="$(find_latest "${RELEASE_DIR}/windieos_*_amd64.deb")"
RPM_ARTIFACT="$(find_latest "${RELEASE_DIR}/windieos_*_x86_64.rpm")"
APPIMAGE_ARTIFACT="$(find_latest "${RELEASE_DIR}/windieos_*_x86_64.AppImage")"

[[ -n "${DEB_ARTIFACT}" ]] || { echo "Missing .deb artifact" >&2; exit 1; }
[[ -n "${RPM_ARTIFACT}" ]] || { echo "Missing .rpm artifact" >&2; exit 1; }
[[ -n "${APPIMAGE_ARTIFACT}" ]] || { echo "Missing .AppImage artifact" >&2; exit 1; }

sudo apt-get install -y "${DEB_ARTIFACT}"

if command -v windieos >/dev/null 2>&1; then
  launch_check windieos --version
elif [[ -x "/opt/WindieOS/windieos" ]]; then
  launch_check /opt/WindieOS/windieos --version
elif [[ -x "/opt/WindieOS/WindieOS" ]]; then
  launch_check /opt/WindieOS/WindieOS --version
else
  echo "Installed DEB but unable to locate windieos executable." >&2
  exit 1
fi

chmod +x "${APPIMAGE_ARTIFACT}"
"${APPIMAGE_ARTIFACT}" --appimage-version >/tmp/windieos-appimage-version.log 2>&1

rpm -qpi "${RPM_ARTIFACT}" >/tmp/windieos-rpm-info.log
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${RELEASE_DIR}:/release:ro" fedora:41 \
    bash -lc "dnf -y install /release/$(basename "${RPM_ARTIFACT}") && rpm -q windieos"
fi
