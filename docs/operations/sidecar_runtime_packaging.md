---
summary: "Bundled Sidecar Python Runtime Packaging"
read_when:
  - When shipping frontend-only installers with no system Python requirement.
  - When preparing Windows/macOS/Linux release artifacts for end users.
---

# Bundled Sidecar Python Runtime Packaging

This guide explains how to build installers where end users only install the
frontend app and do not need Python installed system-wide.

## Outcome

- Installer includes Electron app.
- Installer includes a bundled Python runtime at `resources/python-runtime`.
- Sidecar processes run from `resources/python-runtime/sidecar`.
- Runtime build ships sidecar bytecode (`.pyc`) only; sidecar plaintext `.py` files are removed before packaging.
- Runtime defaults to system-browser-first packaging and does not prebundle Playwright Chromium.

## Repository Pieces

- Runtime-aware sidecar launch path resolution:
  - `frontend/src/main/runtime_paths.cjs`
  - `frontend/src/main/local_backend_bridge.cjs`
  - `frontend/src/main/wakeword_bridge.cjs`
- Runtime dependency set:
  - `frontend/src/main/python/requirements.runtime.txt`
- Runtime build helper:
  - `scripts/build-sidecar-runtime`
- Bundled-python packaging profile:
  - `frontend/electron-builder.bundled-python.yml`

## Build Matrix Rule

Build each runtime on its target OS:

- Windows runtime built on Windows.
- macOS runtime built on macOS.
- Linux runtime built on Linux.

Do not reuse one OS runtime for another OS release.

## Step 1: Build Sidecar Runtime

From repo root:

```bash
bash scripts/build-sidecar-runtime
```

This creates:

- `frontend/python-runtime/` (runtime files for installer embedding)
- `frontend/python-runtime.tar.gz` (packed artifact)

## Step 2: Build Bundled-Python Installer

From `frontend/`:

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Use only the command for the OS you are currently building on.

CI equivalent:

- Use `.github/workflows/desktop-release.yml` to build all OS artifacts on native runners.
- The workflow enforces "build runtime on target OS" automatically.
- Smoke checks run after packaging:
  - Linux: install `deb`, launch check, AppImage check, rpm metadata/install probe
  - Windows: silent installer run + launch check
  - macOS: no GitHub-hosted smoke step; CI relies on signing/notarization plus artifact publication, while downloaded-app Gatekeeper validation stays manual on a local macOS machine

## Step 3: Configure Hosted Backend Endpoint

Packaged builds default to hosted backend:

- `https://api.windieos.com`
- `wss://api.windieos.com/ws`

Before launching installed app, set backend URL env vars when you need a different backend:

```bash
export BACKEND_HTTP_URL="https://your-api.example.com"
export BACKEND_WS_URL="wss://your-api.example.com/ws"
```

Packaged-default override vars (used only when `BACKEND_*` is unset):

```bash
export WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL="https://your-api.example.com"
export WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL="wss://your-api.example.com/ws"
```

## Optional Overrides

- `WINDIE_PYTHON_PATH` can force a specific Python executable.
- Packaged apps do not fall back to `CONDA_PREFIX` or system Python when bundled runtime is missing.
- `BACKEND_HOST` + `BACKEND_PORT` can be used instead of full URL vars.

## Verification Checklist

On a clean test machine:

1. Ensure system Python is not installed (or unavailable in `PATH`).
2. Install built app.
   - Linux `.deb` package name is `windieos`.
   - Install command example: `sudo apt install -y ./release/windieos_*_amd64.deb`
   - Uninstall command example: `sudo apt purge -y windieos`
   - Review dependency cleanup before running autoremove: `sudo apt autoremove --dry-run`
3. Launch app and verify sidecar starts without Python-not-found errors.
4. Send a prompt and verify local tools execute (screenshot/mouse/keyboard flow).
5. Verify wakeword initialization path.
6. Verify backend connectivity via hosted `wss://` + `https://`.

## Known Platform Notes

- Linux may require non-Python packages for some operations (for example `xdotool`).
- Linux `.deb`/`.rpm` installers declare `xdotool` package dependency; AppImage users must install `xdotool` manually.
- Sidecar startup/status now emits runtime dependency warnings when `xdotool` is missing so degraded window probes are visible in logs/status payloads.
- Bundled runtimes now ship relocatable interpreter trees on Windows, macOS, and Linux (not host-bound `venv` shells) so installed apps do not depend on build-machine Python paths.
- POSIX runtime validation now imports stdlib extension modules (`_socket`, `_ssl`, `_sqlite3`) from inside the bundled runtime and fails packaging when host-prefix leakage is detected.
- Packaged POSIX sidecar launches now set `PYTHONHOME` to the bundled runtime root and clear inherited `PYTHONPATH` so macOS/Linux sidecar processes resolve stdlib/site-packages from app resources instead of any host interpreter config.
- Packaged bundled-runtime Python launches now set `PYTHONDONTWRITEBYTECODE=1` so stdlib imports do not create `__pycache__` files inside signed app resources after install.
- macOS package builds now re-sign every Mach-O file inside `Contents/Resources/python-runtime` in the electron-builder `afterPack` pre-sign hook so copied or thinned CPython binaries/extensions are fixed before the final app signing and notarization pass.
- Runtime packaging now prunes build-only payload after dependency install: bundled `pip`/`setuptools`/`wheel`, `ensurepip`, static `.a` libraries, duplicate `lib/python3.1`, and package test/source fixture trees (for example `tests/`, `.pyx`, `.npz`) are removed before validation/archive creation.
- macOS runtime packaging now thins bundled universal Mach-O files to the target architecture during runtime build so Apple Silicon installers do not ship extra Intel slices inside copied Python dependencies.
- Release runtime bundles browser Python dependencies but does not ship a preinstalled Chromium payload.
- Browser automation uses an installed Chrome/Chromium-family browser first and only installs Chromium after user consent when no compatible browser is found.
- Runtime build is idempotent for bundled assets: wakeword prefetch is skipped when already present.
- Packaged app disables browser feature-pack runtime auto-install; missing sidecar runtime deps are treated as build/package errors.
- Browser automation permission flow checks Chromium availability at runtime and can install Chromium on user consent when needed.
- Browser `extract`/`read_long_content` now use deterministic markdown extraction in sidecar (no sidecar LLM provider SDK dependency).
- Browser launch first checks system-installed Chrome/Chromium-family browsers, then falls back to any Chromium previously installed into the user Playwright cache.
- Wakeword model prefetch is required during runtime build; build fails when prefetch fails (unless explicitly overridden via `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`).
- Packaged wakeword runtime disables model download fallback; missing wakeword model is treated as packaging/install error.
