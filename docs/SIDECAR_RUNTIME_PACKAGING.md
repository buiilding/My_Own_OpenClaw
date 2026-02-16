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
- Sidecar processes (`local_backend.py`, `wakeword_service.py`) run from bundled runtime.

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
npm run package:win:bundled-python
npm run package:mac:bundled-python
npm run package:linux:bundled-python
```

Use only the command for the OS you are currently building on.

## Step 3: Configure Hosted Backend Endpoint

Before launching installed app, set backend URL env vars as needed:

```bash
export BACKEND_HTTP_URL="https://your-api.example.com"
export BACKEND_WS_URL="wss://your-api.example.com/ws"
```

## Optional Overrides

- `WINDIE_PYTHON_PATH` can force a specific Python executable.
- `BACKEND_HOST` + `BACKEND_PORT` can be used instead of full URL vars.

## Verification Checklist

On a clean test machine:

1. Ensure system Python is not installed (or unavailable in `PATH`).
2. Install built app.
3. Launch app and verify sidecar starts without Python-not-found errors.
4. Send a prompt and verify local tools execute (screenshot/mouse/keyboard flow).
5. Verify wakeword initialization path.
6. Verify backend connectivity via hosted `wss://` + `https://`.

## Known Platform Notes

- Linux may require non-Python packages for some operations (for example `xdotool`).
- Playwright browser runtime is installed during runtime build step.
- Wakeword model assets are pre-downloaded during runtime build step.
