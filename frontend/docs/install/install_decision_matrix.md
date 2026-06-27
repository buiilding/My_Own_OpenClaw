---
summary: "Install-path decision matrix for WindieOS source development, packaged desktop builds, local reinstall loops, hosted endpoint overrides, and release validation."
read_when:
  - When deciding whether a task needs source setup, packaged install, local reinstall, self-host endpoint configuration, or release packaging validation.
  - When changing install docs, packaging scripts, endpoint defaults, or developer setup assumptions.
title: "Install Decision Matrix"
---

# Install Decision Matrix

Choose the install path from the runtime you need to validate. Source-mode checks are good for code iteration, but packaged checks are required when the change touches bundled Python, Electron Builder output, signing, installed app paths, or OS-level permissions.

## Path Selector

| Goal | Use | Commands | Validates | Does not validate |
| --- | --- | --- | --- | --- |
| edit backend agent/provider/API behavior | source development | `./scripts/python-in-env backend python -m backend.src.main` | backend import, startup, routes, provider config | Electron packaging, bundled local-runtime Python |
| edit renderer/main/local-runtime behavior quickly | Electron dev app | `<windie> start dev` | Vite renderer, Electron main, local-runtime process, SDK runtime transport | installed app state, signing, packaged resource paths |
| verify pure renderer UI build | frontend dev/build | `<windie> start frontend`; `<windie> build frontend` | renderer compile/runtime in browser-like dev mode | Electron main, local runtime, packaged app |
| verify bundled local-runtime Python | local-runtime Python build | `<windie> build local-runtime` | dependency install, bytecode packaging, runtime archive | installer behavior, OS install paths |
| verify installed desktop app locally | local reinstall helper | `<windie> reinstall <platform>` | installed app launch, local state reset, bundled runtime, local-runtime Python startup | release signing/notarization, production publishing |
| verify release artifacts | release workflow and smoke helpers | `.github/workflows/desktop-release.yml`; `scripts/ci/smoke-*` | target-OS package creation, smoke install, release artifact behavior | manual Gatekeeper validation on downloaded macOS apps |
| route app to a non-default backend | endpoint override | `BACKEND_HTTP_URL`, `BACKEND_WS_URL` | desktop/local-runtime traffic reaches intended backend | backend service health by itself |

## Runtime Boundary

| Install concern | Owner | First files |
| --- | --- | --- |
| backend dependencies and config | backend Python runtime | `backend/requirements.txt`, `backend/src/core/config` |
| frontend dependencies and package scripts | frontend Node runtime | `frontend/package.json`, `frontend/vite.config.*`, `frontend/electron-builder.bundled-python.yml` |
| bundled Python runtime dependencies | bundled Python builder | `scripts/build-sidecar-runtime`, `frontend/src/main/python/requirements.runtime.txt` |
| local-runtime launch path | Electron main | `frontend/src/main/app/runtime_paths.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs` |
| wakeword launch path | Electron main plus local-runtime Python | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/python/wakeword_service.py` |
| endpoint selection | Electron main | `frontend/src/main/app/backend_endpoints.cjs` |
| packaged app state reset | reinstall helpers | `<windie> reinstall mac`, `<windie> reinstall win`, `<windie> reinstall linux` |
| release signing/notarization | CI release workflow | `.github/workflows/desktop-release.yml` |

## Required Validation By Change Type

| Change type | Minimum validation |
| --- | --- |
| backend-only API/provider/agent change | `<windie> test backend` plus route/provider-specific checks |
| local-runtime tool or memory implementation change | `<windie> test local-runtime`; Electron dev smoke if bridge payloads changed |
| renderer-only UI change | `cd frontend && npm run test`; add `npm run lint` for shared code |
| Electron main IPC or endpoint change | focused frontend tests plus Electron dev smoke |
| bundled local-runtime dependency change | `<windie> build local-runtime`; package on target OS when feasible |
| local reinstall helper change | run the matching OS helper, then inspect packaged run logs |
| release workflow/signing change | target release workflow or dry-run equivalent; do not publish without approval |

## Rules

- Do not manually activate conda environments for repo commands. Use `./scripts/python-in-env`.
- Build each packaged Python runtime on its target OS.
- Do not treat source Electron success as packaged success when `resources/python-runtime` or installed paths are involved.
- Do not treat local macOS reinstall as notarization validation. The helper intentionally strips signing/notarization variables for fast local loops.
- Do not commit real backend endpoint credentials, install tokens, signing secrets, or user-specific app data.

## Related Docs

- [Local Development](local_development.md)
- [Packaged Desktop Builds](packaged_desktop.md)
- Endpoint Setup (private backend docs)
- [Uninstall, Reinstall, and Reset](uninstall_reinstall_reset.md)
- [Install Troubleshooting](install_troubleshooting.md)
- Runtime Configuration Matrix (private backend docs)
