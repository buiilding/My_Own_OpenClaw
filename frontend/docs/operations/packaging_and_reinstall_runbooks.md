---
summary: "Detailed packaging reinstall runbooks for WindieOS desktop package builds, local reinstall helpers, bundled local-runtime Python packaging, and packaged app validation across macOS, Windows, and Linux."
read_when:
  - When changing packaging reinstall behavior, Electron Builder package commands, bundled Python runtime generation, release artifacts, or local reinstall helpers.
  - When debugging packaged SDK websocket support, the SDK-owned `ws` dependency, or `resources/node_modules/ws`.
  - When debugging packaged app startup, missing bundled local-runtime Python, package signing, notarization, local reinstall state, or OS-specific install state.
title: "Packaging Reinstall Runbooks"
---

# Packaging Reinstall Runbooks

WindieOS packaged builds are Electron apps with a bundled local-runtime Python implementation. Packaging behavior is shared through `frontend/package.json` and `frontend/electron-builder.bundled-python.yml`; reinstall behavior is OS-specific because installed app paths, permissions, state reset, and installer formats differ.

## Packaging Command Map

Run from the repository root:

| Command | Builds | Notes |
| --- | --- | --- |
| `<windie> package <platform>` | Electron Builder targets for the chosen OS | Runs `<windie> build local-runtime` and frontend builds first |
| `<windie> package mac` | macOS DMG and ZIP | Must run on macOS |
| `<windie> package win` | Windows NSIS installer | Must run on Windows |
| `<windie> package linux` | Linux AppImage, DEB, RPM | Must run on Linux |
| `<windie> build local-runtime` | `frontend/python-runtime` and archive | Calls `../scripts/build-sidecar-runtime.sh` |

## Runtime Build Ownership

Primary files:

- `scripts/build-sidecar-runtime.sh`
- `frontend/src/main/python/requirements.runtime.txt`
- `frontend/electron-builder.bundled-python.yml`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `packages/windie-sdk-js/cjs`

Runtime expectations:

- Build each runtime on its target OS.
- Packaged local-runtime Python uses `resources/python-runtime`.
- Packaged app does not depend on conda, system Python, or build-machine venv paths.
- Packaged runtime ships bytecode-only local-runtime Python implementation
  sources.
- Packaged runtime does not prebundle Playwright Chromium.
- Browser automation prefers installed Chrome/Chromium-family browsers and only installs Chromium after user consent when needed.
- Wakeword model prefetch is required unless explicitly overridden with `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`.
- Electron main imports generated SDK CommonJS modules from the packaged
  `resources/packages/windie-sdk-js/cjs` resource tree. Keep `ws` packaged under
  `resources/node_modules/ws`, copied from `packages/windie-sdk-js/node_modules/ws`,
  because the SDK websocket session uses it as a bare CommonJS dependency from
  outside `app.asar`.

## macOS Local Reinstall

Command:

```bash
<windie> reinstall mac
```

What it does:

- Requires macOS and `npm`.
- Resolves the frontend Python build interpreter through `./scripts/python-in-env.sh frontend python` unless `WINDIE_PYTHON_BUILD` is set.
- Stops running installed WindieOS app processes.
- Resets known TCC/privacy grants for the app and helper bundle ids.
- Removes installed app copies and local app state under Application Support, Caches, WebKit, HTTPStorages, Saved Application State, and the packaged-run log.
- Cleans `frontend/dist` and `frontend/release`.
- Reuses `frontend/python-runtime` when the Python identity, `requirements.runtime.txt`, and runtime build script fingerprint match the build stamp.
- Builds the frontend and an unpacked macOS app with `electron-builder --mac dir`.
- Installs to `/Applications/WindieOS.app`.
- Applies an ad-hoc signature.
- Launches through LaunchServices and tails `~/windieos-packaged-run.log`.

Important local-release boundary:

- The script unsets Apple notarization and Developer ID signing env vars.
- It intentionally uses ad-hoc signing to keep local loops fast.
- It is not a substitute for signed/notarized release validation.

Useful overrides:

- `WINDIE_BUNDLE_ID`
- `WINDIE_APP_NAME`
- `WINDIE_LOG_FILE`
- `WINDIE_SIDECAR_LOG_LEVEL`
- `WINDIE_PYTHON_BUILD`

## Windows Local Reinstall

Command:

```powershell
<windie> reinstall win
```

Options:

- `-SkipDataReset`: keep local app data.
- `-SkipLaunch`: install but do not launch after reinstall.

What it does:

- Requires Windows, `npm`, and Bash. If `bash` is missing from `PATH`, it probes common Git Bash install locations.
- Resolves Python from `WINDIE_PYTHON_BUILD`, conda env `frontend_jarvis`, `py -3.11`, or `python`.
- Warns when Developer Mode/symlink creation may block Electron Builder helper extraction.
- Stops running WindieOS processes by app name and install-root paths.
- Runs the existing uninstaller if found.
- Removes leftover install roots.
- Resets local app state unless `-SkipDataReset` is set.
- Cleans `dist`, `release`, `python-runtime`, and `python-runtime.tar.gz`.
- Runs `<windie> package win`.
- Installs the newest `*Setup*.exe` silently.
- Launches the installed app unless `-SkipLaunch` is set.

Useful overrides:

- `WINDIE_APP_NAME`
- `WINDIE_SIDECAR_LOG_LEVEL`
- `WINDIE_FRONTEND_ENV`
- `WINDIE_PYTHON_BUILD`

## Linux Local Reinstall

Command:

```bash
<windie> reinstall linux
```

What it does:

- Targets Debian/Ubuntu systems with `apt`.
- Requires `conda`, `npm`, and an executable Python build interpreter.
- Defaults Python build interpreter to `/home/peter/miniconda3/envs/frontend_jarvis/bin/python` unless `WINDIE_PYTHON_BUILD` is set.
- Stops running `windieos` processes.
- Purges the installed `windieos` package if present.
- Runs `sudo apt autoremove -y`.
- Cleans `release`, `dist`, `python-runtime`, and `python-runtime.tar.gz`.
- Runs `conda run -n frontend_jarvis npm ci`.
- Runs `<windie> package linux`.
- Installs the newest `release/windieos_*_amd64.deb`.
- Verifies bundled runtime Python and `_tkinter`.

Useful overrides:

- `WINDIE_PYTHON_BUILD`
- `WINDIE_CONDA_ENV`

## Release Workflow Boundary

Release artifacts are built by:

- `.github/workflows/desktop-release.yml`

Release behavior:

- Native OS runners build native packaged artifacts.
- Linux and Windows run packaged smoke checks in CI.
- macOS publish runs require signing and notarization.
- macOS downloaded-app Gatekeeper validation remains manual/local because it can stall hosted runners.
- Published releases upload artifacts directly to the GitHub release instead of relying on workflow-run artifact retention.

Signing secrets:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

Do not change version numbers, tags, or publish artifacts without explicit approval.

## Debug Matrix

| Symptom | Likely owner | First checks |
| --- | --- | --- |
| Packaged app cannot find `packages/windie-sdk-js/cjs` or `ws` at launch | generated SDK CJS resources or SDK-owned websocket dependency missing from Electron Builder config | inspect package contents under `resources/packages/windie-sdk-js/cjs` and `resources/node_modules/ws`; verify the source path is `packages/windie-sdk-js/node_modules/ws` |
| Packaged app cannot start local runtime | runtime path or bundled Python missing | `frontend/src/main/app/runtime_paths.cjs`, package contents under `resources/python-runtime`, local-runtime logs |
| macOS local build hangs on signing/notarization | wrong path: using release signing instead of local reinstall | confirm reinstall helper strips `APPLE_*` and `CSC_*`; use ad-hoc local path |
| macOS app launches from copied install but not DMG | signing/hardened runtime/Gatekeeper path | `scripts/ci/smoke-macos-packages.sh`, [Release Guide](release.md) |
| Windows packaging fails extracting signing helper | symlink/developer mode | run reinstall helper preflight, enable Developer Mode or use elevated shell |
| Linux AppImage browser tools fail but DEB works | missing system package | verify `xdotool` installed for AppImage users |
| Packaged app connects to wrong backend | endpoint env/default resolution | Runtime Configuration Matrix (private backend docs), `frontend/src/main/app/backend_endpoints.cjs` |
| Browser tool asks to install Chromium | no compatible system browser and no Playwright cache | [Browser Troubleshooting](../browser/browser_troubleshooting.md) |

## Validation Checklist

For packaging changes:

1. Run the package command on the target OS.
2. Inspect package contents for `resources/python-runtime`, `resources/packages/windie-sdk-js/cjs`, and `resources/node_modules/ws`; `ws` should be copied from `packages/windie-sdk-js/node_modules/ws`, not a frontend direct dependency.
3. Launch installed app, not only the source Electron app.
4. Verify backend connectivity to the intended endpoint.
5. Verify one local tool call that exercises local-runtime Python.
6. Verify wakeword startup path if runtime packaging changed.
7. Run the matching `scripts/ci/smoke-*` helper where available.
8. Update [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md), [Packaged Desktop Builds](../install/packaged_desktop.md), and [Release Guide](release.md) when behavior changes.
