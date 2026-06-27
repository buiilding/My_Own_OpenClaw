#!/usr/bin/env bash
# Runs the smoke macos packages workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/release"
INSTALLED_APP=""
MOUNT_POINT=""
APP_PID=""

run_binary_smoke() {
  local app_bundle="$1"
  local label="$2"
  local binary_path="${app_bundle}/Contents/MacOS/WindieOS"
  local log_path="/tmp/windieos-macos-smoke-$(echo "${label}" | tr '[:upper:] ' '[:lower:]-').log"
  local pid=""

  if [[ ! -x "${binary_path}" ]]; then
    binary_path="$(find "${app_bundle}/Contents/MacOS" -maxdepth 1 -type f -perm -111 -print -quit)"
  fi
  [[ -n "${binary_path}" ]] || { echo "Unable to locate app executable for ${label}." >&2; exit 1; }

  "${binary_path}" --version >"${log_path}" 2>&1 &
  pid=$!
  sleep 10

  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
    return 0
  fi

  wait "${pid}" || {
    cat "${log_path}" >&2
    echo "${label} app smoke launch failed." >&2
    exit 1
  }
}

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

run_binary_smoke "${APP_IN_DMG}" "mounted-dmg"

RUNTIME_ROOT="${INSTALLED_APP}/Contents/Resources/python-runtime"
RUNTIME_PYTHON="${RUNTIME_ROOT}/bin/python3"
[[ -x "${RUNTIME_PYTHON}" ]] || { echo "Bundled runtime python missing at ${RUNTIME_PYTHON}" >&2; exit 1; }

env -u PYTHONPATH PYTHONDONTWRITEBYTECODE=1 PYTHONHOME="${RUNTIME_ROOT}" PYTHONNOUSERSITE=1 "${RUNTIME_PYTHON}" - "${RUNTIME_ROOT}" <<'PY'
from __future__ import annotations

import pathlib
import sqlite3
import ssl
import sys

import _socket
import _sqlite3
import _ssl

runtime_root = pathlib.Path(sys.argv[1]).resolve()
version = f"{sys.version_info.major}.{sys.version_info.minor}"
expected_stdlib = runtime_root / "lib" / f"python{version}"
offenders = []

for attribute in ("prefix", "exec_prefix", "base_prefix", "base_exec_prefix"):
    value = pathlib.Path(getattr(sys, attribute)).resolve()
    if value != runtime_root:
        offenders.append(f"{attribute}={value}")

for module_name, module in {
    "_socket": _socket,
    "_ssl": _ssl,
    "_sqlite3": _sqlite3,
    "ssl": ssl,
    "sqlite3": sqlite3,
}.items():
    module_path = pathlib.Path(getattr(module, "__file__", "")).resolve()
    if not module_path.is_relative_to(runtime_root):
        offenders.append(f"{module_name}={module_path}")

if not expected_stdlib.exists():
    offenders.append(f"missing_stdlib={expected_stdlib}")

if offenders:
    raise SystemExit(
        "Bundled runtime leaked host paths or is missing stdlib entries: "
        + ", ".join(offenders)
    )
PY

if [[ "${validate_downloaded_app}" == "true" ]]; then
  quarantine_value="0083;$(date +%s);WindieOS CI;$(uuidgen)"
  # Mirror Finder's downloaded-app flow without mutating sealed resources inside the bundle.
  xattr -w com.apple.quarantine "${quarantine_value}" "${INSTALLED_APP}"

  if ! codesign --verify --deep --strict --verbose=4 "${INSTALLED_APP}" >/tmp/windieos-macos-codesign.log 2>&1; then
    cat /tmp/windieos-macos-codesign.log >&2
    echo "codesign verification failed for the installed app bundle before Gatekeeper assessment." >&2
    exit 1
  fi

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

run_binary_smoke "${INSTALLED_APP}" "installed-app"

if [[ "${WINDIE_REQUIRE_SIGNING:-false}" == "true" ]]; then
  codesign --verify --deep --strict --verbose=2 "${INSTALLED_APP}"
fi
