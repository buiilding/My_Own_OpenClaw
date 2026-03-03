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
- Full-profile runtime bundles Playwright Chromium payload at `resources/python-runtime/ms-playwright`.

## Repository Pieces

- Runtime-aware sidecar launch path resolution:
  - `frontend/src/main/runtime_paths.cjs`
  - `frontend/src/main/local_backend_bridge.cjs`
  - `frontend/src/main/wakeword_bridge.cjs`
- Runtime dependency set:
  - `frontend/src/main/python/requirements.runtime.txt` (full aggregate profile)
  - `frontend/src/main/python/requirements.runtime.core.txt`
  - `frontend/src/main/python/requirements.runtime.browser.txt`
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

From repo root (release policy: full profile, all bundled):

```bash
bash scripts/build-sidecar-runtime-full
```

Alternative profiles (for development only):

```bash
WINDIE_SIDECAR_RUNTIME_MODE=slim \
WINDIE_SIDECAR_RUNTIME_PROFILE=core+browser bash scripts/build-sidecar-runtime
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

Explicit bundled/full variants:

```bash
npm run package:win:bundled-python:full
npm run package:mac:bundled-python:full
npm run package:linux:bundled-python:full
```

Core+browser-deps variants (no bundled Playwright browser binary payload):

```bash
npm run package:win:bundled-python:core+browser
npm run package:mac:bundled-python:core+browser
npm run package:linux:bundled-python:core+browser
```

Use only the command for the OS you are currently building on.

CI equivalent:

- Use `.github/workflows/desktop-release.yml` to build all OS artifacts on native runners.
- The workflow enforces "build runtime on target OS" automatically.
- Smoke checks run after packaging:
  - Linux: install `deb`, launch check, AppImage check, rpm metadata/install probe
  - Windows: silent installer run + launch check
  - macOS: dmg mount/copy + launch check (+ codesign verify when signing enabled)

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
- Release runtime is full-profile and bundles browser Python dependencies + Playwright Chromium payload.
- Packaged launch exports `PLAYWRIGHT_BROWSERS_PATH` to bundled runtime so browser automation uses bundled Chromium by default.
- Runtime build is idempotent for bundled assets: wakeword prefetch and Playwright Chromium install are skipped when already present.
- Packaged app disables browser feature-pack runtime auto-install; missing browser deps are treated as build/package errors.
- Browser `extract`/`read_long_content` now use deterministic markdown extraction in sidecar (no sidecar LLM provider SDK dependency).
- Browser launch first checks bundled Playwright Chromium payload, then falls back to system-installed Chromium-based browsers.
- Wakeword model prefetch is required during runtime build; build fails when prefetch fails (unless explicitly overridden via `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`).
- Packaged wakeword runtime disables model download fallback; missing wakeword model is treated as packaging/install error.
