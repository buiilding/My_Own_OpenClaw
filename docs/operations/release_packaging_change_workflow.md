---
summary: "Workflow for changing WindieOS release, packaging, bundled local-runtime Python, smoke-check, and local reinstall behavior without confusing source-mode success with installed-app success."
read_when:
  - When changing Electron Builder package targets, release workflow steps, signing/notarization behavior, bundled Python runtime generation, packaged backend defaults, local reinstall helpers, or packaged smoke checks.
  - When a packaged app behaves differently from `<windie> start desktop`, cannot start the local runtime, connects to the wrong backend, misses wakeword/browser runtime assets, or fails only after installation.
title: "Release and Packaging Change Workflow"
---

# Release and Packaging Change Workflow

Use this workflow when the changed behavior only becomes real after WindieOS is packaged or installed. Source-mode success is not packaged-app success: source mode can see the checkout, conda envs, dev server ports, writable source folders, and local shell state that an installed app must not rely on.

The release path has two different jobs:

- **Local packaged validation:** rebuild, reinstall, reset state, launch the installed app, and collect logs quickly.
- **Release publication:** build native artifacts, apply real signing/notarization where required, create or update a GitHub release, and upload installers. Do not change versions, tags, or publish artifacts without explicit approval.

## Fast Owner Map

| Symptom or request | Primary owner | First source roots | First docs |
| --- | --- | --- | --- |
| Package command, target type, output name, or artifact inclusion changes | Electron Builder config and package scripts | `frontend/package.json`, `frontend/electron-builder.yml`, `frontend/electron-builder.bundled-python.yml` | [Packaging and Release Commands](../cli/packaging_and_release_commands.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) |
| Bundled Python runtime is missing, host-bound, too large, unsigned, or missing dependencies | Bundled local-runtime Python build | `scripts/build-sidecar-runtime`, `frontend/src/main/python/requirements.runtime.txt`, `frontend/src/main/app/runtime_paths.cjs` | [Bundled Local-Runtime Python Packaging](sidecar_runtime_packaging.md), [Packaged Desktop Builds](../install/packaged_desktop.md) |
| Installed app cannot start local runtime, wakeword, memory service, or local tools | Electron main launch path plus bundled local-runtime Python | `frontend/src/main/app/runtime_paths.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/python/core/bootstrap_paths.py` | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Desktop and Local Runtime Node](../nodes/desktop_and_sidecar_node.md) |
| Packaged app connects to local or stale backend instead of hosted/staging backend | Endpoint resolution and local-runtime backend config | `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/python/windie/_backend_config.py` | [Runtime Configuration Matrix](runtime_configuration_matrix.md), [Backend Endpoint Setup](../install/local_backend_and_endpoint_setup.md) |
| Local reinstall keeps old state, permissions, logs, or app binaries | OS reinstall helper | `<windie> reinstall mac`, `<windie> reinstall linux`, `<windie> reinstall win` | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md) |
| CI release build or artifact upload changes | Desktop release workflow | `.github/workflows/desktop-release.yml`, platform smoke scripts under `scripts/ci/` | [Release Guide](release.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) |
| macOS build fails only when signed, notarized, downloaded, mounted, or launched from DMG | macOS signing/notarization and smoke path | `.github/workflows/desktop-release.yml`, `scripts/ci/smoke-macos-packages.sh`, `frontend/electron-builder.yml` | [Release Guide](release.md), [macOS Platform Notes](../platforms/macos.md) |
| Windows installer fails, helper extraction fails, or silent install does not launch | Windows package target and reinstall/smoke scripts | `<windie> reinstall win`, `scripts/ci/smoke-windows-packages.ps1`, `frontend/electron-builder.yml` | [Windows Platform Notes](../platforms/windows.md), [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md) |
| Linux DEB/RPM/AppImage differs, lacks system dependencies, or launches without tool support | Linux package metadata and smoke path | `<windie> reinstall linux`, `scripts/ci/smoke-linux-packages.sh`, `frontend/electron-builder.yml` | [Linux Platform Notes](../platforms/linux.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) |

## Boundary Rules

- Package builds are OS-native. Build and validate macOS artifacts on macOS, Windows artifacts on Windows, and Linux artifacts on Linux.
- Packaged bundled Python runtime must not depend on conda, system Python, build-machine virtualenv paths, source checkout paths, or writable files inside signed app resources.
- `resources/python-runtime` is the packaged bundled Python runtime location. If this path changes, update runtime path resolution, Electron Builder resources, smoke checks, and docs together.
- Local macOS reinstall intentionally strips Apple signing/notarization env vars and uses ad-hoc signing. That path is for fast installed-app validation, not release-signing validation.
- Release signing secrets must stay in CI secrets or local environment only. Never document real credential values or commit generated certificates.
- Browser and wakeword runtime assets are packaging responsibilities when packaged fallback downloads are disabled. Missing packaged assets should fail build or smoke validation rather than silently relying on source-mode behavior.
- Frontend and the local-runtime Python implementation must not inspect backend
  source to make packaged behavior work. Endpoint, auth, and runtime defaults
  must flow through explicit config and IPC/env boundaries.

## Change Sequence

1. **Classify the change.** Decide whether it is source-only, packaged-runtime, reinstall/reset, smoke-check, or release-publication work. Use [Install Decision Matrix](../install/install_decision_matrix.md) when the path is unclear.
2. **Read the owner docs.** For packaging work, read this page, [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md), and [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md).
3. **Inspect the source roots.** Start with the roots in the owner map before broad searches. For runtime failures, inspect path resolution and local-runtime launch code before package metadata.
4. **Edit the producer first.** Fix package scripts, runtime assembly, endpoint resolution, or reinstall cleanup at the owner layer before adding consumer-side tolerance.
5. **Update platform-specific paths explicitly.** If behavior differs by OS, update the matching OS helper, smoke script, platform doc, and validation notes.
6. **Run source validation when source code changed.** Use focused frontend/local-runtime Python tests for runtime path, endpoint, wakeword, browser, and local-runtime bridge changes.
7. **Run packaged validation on the target OS.** Build the bundled runtime, package the app, install or mount it, launch the installed app, and execute one local-runtime-backed action.
8. **Update release docs only for release behavior.** Keep local reinstall notes separate from signing, notarization, tag, and artifact publication behavior.

## Runtime Build Checklist

When touching `scripts/build-sidecar-runtime`, `requirements.runtime.txt`, or runtime path resolution:

- Confirm `<windie> build local-runtime` still creates `frontend/python-runtime`.
- Confirm runtime dependencies come from `frontend/src/main/python/requirements.runtime.txt`, not the dev requirements set.
- Confirm packaged launch code resolves bytecode sidecar entrypoints and bundled Python before any source-mode fallback.
- Confirm POSIX packaged launches do not inherit host `PYTHONPATH` or rely on host `PYTHONHOME`.
- Confirm wakeword model prefetch behavior is intentional and documented when changed.
- Confirm browser automation still follows the system-browser-first packaged policy.
- Add or update focused tests for `frontend/src/main/app/runtime_paths.cjs` and sidecar bootstrap/config code when path contracts change.

## Local Reinstall Checklist

Use reinstall helpers when the question is "what will a user get after installing this build?"

| OS | Helper | Must prove |
| --- | --- | --- |
| macOS | `<windie> reinstall mac` | Old app copies and local state are reset as intended; ad-hoc installed app launches; packaged logs are collected; release signing is not accidentally invoked. |
| Windows | `<windie> reinstall win` | Installer can run silently; install roots are replaced; optional data reset is honored; app launches from the installed location. |
| Linux | `<windie> reinstall linux` | Package installs through the OS package manager; expected system dependencies are present; bundled Python and key stdlib modules import. |

Do not treat a reinstall helper as enough for release publication. Reinstall helpers validate installed local behavior; release workflows validate artifact production and signing/publication constraints.

## Smoke and Release Checklist

For release workflow or smoke-check changes:

- Read `.github/workflows/desktop-release.yml` before editing release behavior.
- Keep macOS, Windows, and Linux signing inputs separate.
- Keep macOS downloaded-app Gatekeeper validation local/manual unless there is a proven non-stalling CI path.
- Run or update the matching smoke helper under `scripts/ci/`.
- For publish behavior, confirm `publish_release`, `run_signing`, and `release_tag` semantics in the workflow docs.
- Confirm artifacts upload directly to the GitHub release when publish mode is enabled.
- Record any intentionally skipped platform smoke check in the release notes or PR summary.

## Debugging Packaged-Only Failures

Start with the installed-app signal, not the dev app:

| Failure | First evidence | Likely fix area |
| --- | --- | --- |
| App opens but local-runtime status never becomes ready | Packaged app logs, local-runtime Python stderr, `resources/python-runtime` contents | runtime path resolver, runtime build script, runtime requirements |
| Works in `electron:dev` but not installed app | Compare source paths to `process.resourcesPath` paths | packaged path resolver or missing `extraResources` entry |
| Backend websocket fails only in installed app | endpoint env/defaults and install auth token path | Electron endpoint forwarding, renderer app-runtime endpoint/status clients, local-runtime backend config |
| Wakeword works in source mode but not package | wakeword model files and bridge launch logs | runtime asset prefetch, wakeword bridge, runtime requirements |
| Browser works in source mode but package asks for Chromium unexpectedly | browser availability logs and Playwright cache path | packaged browser policy, feature-pack installer, system-browser detection |
| macOS DMG-mounted app crashes but copied app works | `codesign`, `spctl`, smoke helper output | signing, hardened runtime entitlements, bundled Mach-O signing |
| Linux AppImage misses input/window behavior | Local-runtime Python platform dependency warnings | Linux package dependency metadata, AppImage user dependency docs |

## Validation Matrix

| Change type | Focused validation |
| --- | --- |
| Package script/config docs only | `<windie> docs list`, `git diff --check`, focused Markdown link checks |
| `frontend/package.json` package script change | `cd frontend && npm run release:check`, `<windie> build frontend`, target package command on target OS |
| Runtime path resolver change | `cd frontend && npm run test -- RuntimePaths`, installed app smoke on target OS |
| Local-runtime Python requirement/build change | `<windie> build local-runtime`, `<windie> test local-runtime`, target package command |
| Backend endpoint packaged-default change | frontend endpoint tests, local-runtime backend-config tests, installed app websocket smoke |
| Reinstall helper change | run the matching helper on that OS; verify reset scope and launch logs |
| Release workflow change | workflow syntax review, dry-run/manual dispatch reasoning, matching smoke helper, release doc update |

## Review Checklist

Before committing packaging or release work:

- Did the docs distinguish local reinstall, packaged validation, and release publication?
- Did every changed OS path update the matching platform doc or matrix?
- Did runtime path changes avoid source checkout and conda fallback in packaged mode?
- Did the change preserve explicit user approval for version bumps, tags, and published artifacts?
- Did tests or smoke checks cover the owner boundary rather than only the renderer symptom?
- Did `CHANGELOG.md` mention the packaging/release behavior or docs change?

## Related Docs

- [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)
- [Release Guide](release.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md)
- [Packaging and Release Commands](../cli/packaging_and_release_commands.md)
