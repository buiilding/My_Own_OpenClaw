---
summary: "Install troubleshooting guide for WindieOS source setup, package builds, bundled local-runtime Python, endpoint routing, permissions, signing, and platform-specific install failures."
read_when:
  - When source setup, npm install/build, Electron launch, local-runtime startup, packaged reinstall, endpoint routing, or platform package install fails.
  - When deciding whether an install failure belongs to frontend Node tooling, Electron main, bundled local-runtime Python packaging, OS permissions, release signing, or private backend setup.
title: "Install Troubleshooting"
---

# Install Troubleshooting

First classify the failure by runtime boundary. Many install failures look like app bugs, but the first broken layer is often dependency setup, endpoint selection, bundled local-runtime Python path resolution, or platform package state.

## Symptom Map

| Symptom | Likely owner | First checks |
| --- | --- | --- |
| frontend command cannot find packages | Node install | `<windie> start dev` auto-installs missing source-mode Node packages; otherwise run `cd frontend && npm install`; inspect `frontend/package.json` scripts |
| Electron dev cannot find `ws` from `packages/windie-sdk-js/cjs` | SDK package install | `<windie> start dev` auto-installs the SDK package when `packages/windie-sdk-js/node_modules/ws` is missing; otherwise run `cd packages/windie-sdk-js && npm install` |
| Electron dev launches but cannot connect | endpoint selection or backend health | `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, backend health route |
| renderer loads but local tools fail | Electron main local-runtime bridge | local-runtime readiness logs, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` |
| packaged app cannot start local runtime | bundled runtime path or missing runtime deps | inspect `resources/python-runtime`, `frontend/src/main/app/runtime_paths.cjs`, packaged run log |
| local macOS reinstall waits on signing | wrong workflow for local loop | use reinstall helper; confirm release signing env is not driving local packaging |
| Windows packaging fails extracting helpers | symlink/developer-mode issue | enable Developer Mode or run elevated shell; use Windows reinstall helper preflight |
| Linux package installs but browser tools fail | missing OS dependency or AppImage gap | install `xdotool` for AppImage users; prefer DEB/RPM dependency metadata |
| app connects to hosted when local expected | endpoint env missing | set `BACKEND_HTTP_URL` and `BACKEND_WS_URL` explicitly |
| hosted route returns `401` | install auth or private automation key | verify token/key and target host |

## Fast Checks

Frontend:

```bash
(cd frontend && npm install)
(cd packages/windie-sdk-js && npm install)
<windie> build frontend
<windie> start dev
```

Local-runtime Python:

```bash
<windie> test local-runtime
WINDIE_SIDECAR_LOG_LEVEL=DEBUG <windie> start dev
```

Packaging:

```bash
<windie> build local-runtime
<windie> package mac
```

Docs:

```bash
<windie> docs list
```

## When Source Works But Packaged Fails

Check packaged-only contracts:

- packaged local runtime uses `resources/python-runtime`
- packaged app does not depend on conda or system Python
- `PYTHONHOME` and `PYTHONPATH` are controlled for POSIX bundled runtimes
- local-runtime Python plaintext sources are removed before packaging
- wakeword model must be prefetched unless `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`
- browser automation uses system Chrome/Chromium first and does not prebundle Playwright Chromium
- macOS packaged runtime Mach-O files must be signed in the release path

## When Packaged Works But Dev Fails

Check source-only assumptions:

- current shell may not have the expected Python packages unless routed through `./scripts/python-in-env`
- Vite dev server and Electron dev app are separate commands
- explicit local backend origins need endpoint overrides
- development may use the hosted backend by default
- renderer localStorage or Electron user data may still hold previous settings

## Escalation Route

1. Use [Install Decision Matrix](install_decision_matrix.md) to confirm the intended path.
2. Use Backend Endpoint Setup (private backend docs) when the failure is connection/auth/tunnel related.
3. Use [Uninstall, Reinstall, and Reset](uninstall_reinstall_reset.md) when installed app state may be stale.
4. Use [Diagnostic Flags](../debug/diagnostic_flags.md) for the smallest useful log signal.
5. Use Process Health Checklist (private backend docs) if a runtime looks dead or disconnected.

## Related Docs

- [Local Development](local_development.md)
- [Packaged Desktop Builds](packaged_desktop.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- Runtime Configuration Matrix (private backend docs)
- Gateway Troubleshooting (private backend docs)
