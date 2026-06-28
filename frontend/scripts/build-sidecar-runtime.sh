#!/usr/bin/env bash
# Runs the build sidecar runtime workflow for the developer CLI and automation tooling.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}"
RUNTIME_DIR="${FRONTEND_DIR}/python-runtime"
RUNTIME_ARCHIVE="${FRONTEND_DIR}/python-runtime.tar.gz"
RUNTIME_REQS="${FRONTEND_DIR}/src/main/python/requirements.runtime.txt"
REQUIRE_WAKEWORD_PREFETCH="${WINDIE_REQUIRE_WAKEWORD_PREFETCH:-1}"

if [[ ! -f "${RUNTIME_REQS}" ]]; then
  echo "[build-sidecar-runtime] Missing runtime requirements file: ${RUNTIME_REQS}" >&2
  exit 1
fi

if [[ -n "${WINDIE_PYTHON_BUILD:-}" ]]; then
  BASE_PYTHON="${WINDIE_PYTHON_BUILD}"
elif command -v python3 >/dev/null 2>&1; then
  BASE_PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  BASE_PYTHON="python"
else
  echo "[build-sidecar-runtime] Could not find python3/python on PATH." >&2
  exit 1
fi

prune_runtime_payload() {
  local runtime_root="$1"
  local runtime_python="$2"

  echo "[build-sidecar-runtime] pruning packaged runtime payload"
  "${runtime_python}" - "${runtime_root}" <<'PY'
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

runtime_root = Path(sys.argv[1]).resolve()
version = f"{sys.version_info.major}.{sys.version_info.minor}"
stdlib_dir = runtime_root / "lib" / f"python{version}"
site_packages = stdlib_dir / "site-packages"
removed_count = 0


def remove_path(path: Path) -> None:
    global removed_count
    if not path.exists() and not path.is_symlink():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()
    removed_count += 1


for relative in (
    Path("bin/pip"),
    Path("bin/pip3"),
    Path(f"bin/pip{version}"),
    Path("bin/wheel"),
    Path("lib") / f"python{version}" / "ensurepip",
    Path("lib") / "python3.1",
):
    remove_path(runtime_root / relative)

for static_lib in (runtime_root / "lib").rglob("*.a"):
    remove_path(static_lib)

for site_name in ("pip", "setuptools", "wheel"):
    remove_path(site_packages / site_name)

for pattern in (
    "pip-*.dist-info",
    "setuptools-*.dist-info",
    "wheel-*.dist-info",
):
    for path in site_packages.glob(pattern):
        remove_path(path)

for pattern in (
    "**/tests",
    "**/test",
):
    for path in site_packages.glob(pattern):
        remove_path(path)

for pattern in (
    "**/*.pyx",
    "**/*.pxd",
    "**/*.npz",
):
    for path in site_packages.glob(pattern):
        remove_path(path)

for path in stdlib_dir.glob("test"):
    remove_path(path)

print(f"[build-sidecar-runtime] pruned runtime paths={removed_count}")
PY
}

thin_macos_universal_binaries() {
  local runtime_root="$1"
  local target_arch="$2"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    return
  fi

  if ! command -v lipo >/dev/null 2>&1; then
    return
  fi

  echo "[build-sidecar-runtime] thinning universal macOS binaries to ${target_arch}"
  "${BASE_PYTHON}" - "${runtime_root}" "${target_arch}" <<'PY'
from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path

runtime_root = Path(sys.argv[1]).resolve()
target_arch = sys.argv[2]
thinned = 0


def is_macho(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            magic = handle.read(4)
    except OSError:
        return False
    return magic in {
        b"\xfe\xed\xfa\xce",
        b"\xce\xfa\xed\xfe",
        b"\xfe\xed\xfa\xcf",
        b"\xcf\xfa\xed\xfe",
        b"\xca\xfe\xba\xbe",
        b"\xbe\xba\xfe\xca",
        b"\xca\xfe\xba\xbf",
        b"\xbf\xba\xfe\xca",
    }


for path in runtime_root.rglob("*"):
    if not path.is_file():
        continue
    if not is_macho(path):
        continue
    try:
        info = subprocess.run(
            ["lipo", "-info", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        continue
    output = (info.stdout or info.stderr or "").strip().lower()
    if "non-fat file" in output or "is architecture:" in output:
        continue
    if "are:" not in output or target_arch.lower() not in output:
        continue
    tmp_path = path.with_name(f".{path.name}.thin")
    result = subprocess.run(
        ["lipo", str(path), "-thin", target_arch, "-output", str(tmp_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        if tmp_path.exists():
            tmp_path.unlink()
        continue
    mode = stat.S_IMODE(path.stat().st_mode)
    os.replace(tmp_path, path)
    path.chmod(mode)
    thinned += 1

print(f"[build-sidecar-runtime] thinned_macho_files={thinned}")
PY
}

echo "[build-sidecar-runtime] profile=runtime"
echo "[build-sidecar-runtime] python=${BASE_PYTHON}"
echo "[build-sidecar-runtime] runtime=${RUNTIME_DIR}"

PYTHON_PLATFORM="$("${BASE_PYTHON}" - <<'PY'
import sys
print(sys.platform)
PY
)"

rm -rf "${RUNTIME_DIR}"

if [[ "${PYTHON_PLATFORM}" == "win32" ]]; then
  echo "[build-sidecar-runtime] creating relocatable Windows runtime (full CPython copy)"
  "${BASE_PYTHON}" - "${RUNTIME_DIR}" <<'PY'
from __future__ import annotations

import shutil
import sys
from pathlib import Path

dest = Path(sys.argv[1]).resolve()
base = Path(sys.base_prefix).resolve()

if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True, exist_ok=True)

runtime_entries = [
    "python.exe",
    "pythonw.exe",
    "python3.dll",
    f"python{sys.version_info.major}{sys.version_info.minor}.dll",
    "DLLs",
    "Library",
    "Lib",
    "libs",
    "Scripts",
    "include",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "msvcp140.dll",
]

for entry in runtime_entries:
    src = base / entry
    if not src.exists():
        continue
    dst = dest / entry
    if src.is_dir():
        shutil.copytree(
            src,
            dst,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
        )
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

pyvenv_cfg = dest / "pyvenv.cfg"
if pyvenv_cfg.exists():
    pyvenv_cfg.unlink()

print(f"[build-sidecar-runtime] copied CPython runtime from {base} to {dest}")
PY
else
  echo "[build-sidecar-runtime] creating relocatable POSIX runtime (copied interpreter prefix)"
  "${BASE_PYTHON}" - "${RUNTIME_DIR}" <<'PY'
from __future__ import annotations

import shutil
import sys
from pathlib import Path

dest = Path(sys.argv[1]).resolve()
base = Path(sys.base_prefix).resolve()
version = f"{sys.version_info.major}.{sys.version_info.minor}"

if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True, exist_ok=True)

python_lib_rel = Path("lib") / f"python{version}"


def ignore_runtime_entries(directory: str, names: list[str]) -> set[str]:
    directory_path = Path(directory)
    ignored = {name for name in names if name == "__pycache__" or name.endswith((".pyc", ".pyo"))}

    try:
        rel = directory_path.resolve().relative_to(base)
    except ValueError:
        return ignored

    if rel == python_lib_rel and "site-packages" in names:
        ignored.add("site-packages")
    return ignored


def copy_entry(src: Path, dst: Path) -> None:
    if not src.exists():
        return
    if src.is_dir():
        shutil.copytree(
            src,
            dst,
            symlinks=False,
            dirs_exist_ok=True,
            ignore=ignore_runtime_entries,
        )
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


bin_dir = base / "bin"
for name in (
    f"python{version}",
    "python3",
    "python",
    "pythonw",
):
    copy_entry(bin_dir / name, dest / "bin" / name)

copy_entry(base / "lib", dest / "lib")
copy_entry(base / "lib64", dest / "lib64")
copy_entry(base / "etc", dest / "etc")

site_packages_dir = dest / python_lib_rel / "site-packages"
if site_packages_dir.exists():
    shutil.rmtree(site_packages_dir)
site_packages_dir.mkdir(parents=True, exist_ok=True)

pyvenv_cfg = dest / "pyvenv.cfg"
if pyvenv_cfg.exists():
    pyvenv_cfg.unlink()

print(f"[build-sidecar-runtime] copied POSIX runtime from {base} to {dest}")
PY
fi

if [[ -x "${RUNTIME_DIR}/python.exe" ]]; then
  RUNTIME_PYTHON="${RUNTIME_DIR}/python.exe"
elif [[ -x "${RUNTIME_DIR}/bin/python" ]]; then
  RUNTIME_PYTHON="${RUNTIME_DIR}/bin/python"
elif [[ -x "${RUNTIME_DIR}/Scripts/python.exe" ]]; then
  RUNTIME_PYTHON="${RUNTIME_DIR}/Scripts/python.exe"
else
  echo "[build-sidecar-runtime] Could not resolve runtime python executable." >&2
  exit 1
fi

if ! "${RUNTIME_PYTHON}" -m pip --version >/dev/null 2>&1; then
  echo "[build-sidecar-runtime] bootstrapping pip via ensurepip"
  "${RUNTIME_PYTHON}" -m ensurepip --upgrade
fi

"${RUNTIME_PYTHON}" -m pip install --upgrade pip setuptools wheel

"${RUNTIME_PYTHON}" -m pip install -r "${RUNTIME_REQS}"

prune_runtime_payload "${RUNTIME_DIR}" "${RUNTIME_PYTHON}"
thin_macos_universal_binaries "${RUNTIME_DIR}" "$("${BASE_PYTHON}" - <<'PY'
import platform
print(platform.machine())
PY
)"

echo "[build-sidecar-runtime] validating relocated runtime imports"
if [[ "${PYTHON_PLATFORM}" == "win32" ]]; then
  "${RUNTIME_PYTHON}" - "${RUNTIME_DIR}" <<'PY'
from __future__ import annotations

import pathlib
import sqlite3
import ssl
import sys
import xml.parsers.expat

import _socket
import _sqlite3
import _ssl
import pyexpat

runtime_root = pathlib.Path(sys.argv[1]).resolve()
version = f"{sys.version_info.major}.{sys.version_info.minor}"
expected_prefix = runtime_root
if sys.platform == "win32":
    expected_stdlib = runtime_root / "Lib"
else:
    expected_stdlib = runtime_root / "lib" / f"python{version}"
offenders: list[str] = []

for attribute in ("prefix", "exec_prefix", "base_prefix", "base_exec_prefix"):
    value = pathlib.Path(getattr(sys, attribute)).resolve()
    if value != expected_prefix:
        offenders.append(f"{attribute}={value}")

for module_name, module in {
    "_socket": _socket,
    "_ssl": _ssl,
    "_sqlite3": _sqlite3,
    "pyexpat": pyexpat,
    "ssl": ssl,
    "sqlite3": sqlite3,
    "xml.parsers.expat": xml.parsers.expat,
}.items():
    module_path = pathlib.Path(getattr(module, "__file__", "")).resolve()
    if not module_path.is_relative_to(runtime_root):
        offenders.append(f"{module_name}={module_path}")

if not expected_stdlib.exists():
    offenders.append(f"missing_stdlib={expected_stdlib}")

if offenders:
    raise RuntimeError(
        "Bundled runtime validation failed; leaked or missing runtime paths: "
        + ", ".join(offenders)
    )

print(f"[build-sidecar-runtime] runtime validation passed for {runtime_root}", file=sys.stderr)
PY
else
  env -u PYTHONPATH PYTHONHOME="${RUNTIME_DIR}" PYTHONNOUSERSITE=1 "${RUNTIME_PYTHON}" - "${RUNTIME_DIR}" <<'PY'
from __future__ import annotations

import pathlib
import sqlite3
import ssl
import sys
import xml.parsers.expat

import _socket
import _sqlite3
import _ssl
import pyexpat

runtime_root = pathlib.Path(sys.argv[1]).resolve()
version = f"{sys.version_info.major}.{sys.version_info.minor}"
expected_prefix = runtime_root
if sys.platform == "win32":
    expected_stdlib = runtime_root / "Lib"
else:
    expected_stdlib = runtime_root / "lib" / f"python{version}"
offenders: list[str] = []

for attribute in ("prefix", "exec_prefix", "base_prefix", "base_exec_prefix"):
    value = pathlib.Path(getattr(sys, attribute)).resolve()
    if value != expected_prefix:
        offenders.append(f"{attribute}={value}")

for module_name, module in {
    "_socket": _socket,
    "_ssl": _ssl,
    "_sqlite3": _sqlite3,
    "pyexpat": pyexpat,
    "ssl": ssl,
    "sqlite3": sqlite3,
    "xml.parsers.expat": xml.parsers.expat,
}.items():
    module_path = pathlib.Path(getattr(module, "__file__", "")).resolve()
    if not module_path.is_relative_to(runtime_root):
        offenders.append(f"{module_name}={module_path}")

if not expected_stdlib.exists():
    offenders.append(f"missing_stdlib={expected_stdlib}")

if offenders:
    raise RuntimeError(
        "Bundled runtime validation failed; leaked or missing runtime paths: "
        + ", ".join(offenders)
    )

print(f"[build-sidecar-runtime] runtime validation passed for {runtime_root}", file=sys.stderr)
PY
fi

echo "[build-sidecar-runtime] prefetching wakeword model assets"
if "${RUNTIME_PYTHON}" - <<'PY'
import importlib
import inspect
import pathlib
import sys

openwakeword_mod = importlib.import_module("openwakeword")
utils_mod = importlib.import_module("openwakeword.utils")

target_dir = pathlib.Path(openwakeword_mod.__file__).resolve().parent / "resources" / "models"
target_dir.mkdir(parents=True, exist_ok=True)
required_model_markers = [
    "hey_jarvis",
    "silero_vad",
    "embedding_model",
    "melspectrogram",
]

def find_missing_markers() -> list[str]:
    missing: list[str] = []
    for marker in required_model_markers:
        if not any(target_dir.glob(f"{marker}*")):
            missing.append(marker)
    return missing

missing_markers = find_missing_markers()
if missing_markers:
    download_models = getattr(utils_mod, "download_models", None)
    if not callable(download_models):
        raise RuntimeError(
            "openwakeword.utils.download_models is unavailable and required wakeword model "
            "assets are missing from site-packages"
        )
    download_params = inspect.signature(download_models).parameters
    if "target_directory" in download_params:
        download_models(["hey_jarvis"], target_directory=str(target_dir))
    else:
        download_models(["hey_jarvis"])
    missing_markers = find_missing_markers()
else:
    print(
        "[build-sidecar-runtime] wakeword models already present; skipping download",
        file=sys.stderr,
    )

if missing_markers:
    raise RuntimeError(
        "Wakeword model prefetch incomplete; missing markers: "
        + ", ".join(missing_markers)
    )

print(f"[build-sidecar-runtime] wakeword models prefetched to {target_dir}", file=sys.stderr)
PY
then
  echo "[build-sidecar-runtime] wakeword prefetch completed"
else
  if [[ "${REQUIRE_WAKEWORD_PREFETCH}" == "1" ]]; then
    echo "[build-sidecar-runtime] ERROR: wakeword prefetch failed; refusing to build runtime without bundled wakeword models" >&2
    exit 1
  fi
  echo "[build-sidecar-runtime] WARNING: wakeword prefetch failed; continuing because WINDIE_REQUIRE_WAKEWORD_PREFETCH=${REQUIRE_WAKEWORD_PREFETCH}"
fi

# Copy WindieOS sidecar source into runtime, compile to sourceless bytecode,
# and delete plaintext .py files before packaging.
SIDECAR_SRC_DIR="${FRONTEND_DIR}/src/main/python"
SIDECAR_DST_DIR="${RUNTIME_DIR}/sidecar"
mkdir -p "${SIDECAR_DST_DIR}"
cp -R "${SIDECAR_SRC_DIR}/." "${SIDECAR_DST_DIR}/"

echo "[build-sidecar-runtime] compiling sidecar to sourceless bytecode"
"${RUNTIME_PYTHON}" -m compileall -q -b "${SIDECAR_DST_DIR}"
find "${SIDECAR_DST_DIR}" -type f -name "*.py" -delete

# Shrink package output by removing transient bytecode caches.
find "${RUNTIME_DIR}" -type d -name "__pycache__" -prune -exec rm -rf {} +
find "${RUNTIME_DIR}" -type f -name "*.pyc" ! -path "${SIDECAR_DST_DIR}/*" -delete

rm -f "${RUNTIME_ARCHIVE}"
tar -C "${FRONTEND_DIR}" -czf "${RUNTIME_ARCHIVE}" "python-runtime"

echo "[build-sidecar-runtime] wrote ${RUNTIME_ARCHIVE}"
