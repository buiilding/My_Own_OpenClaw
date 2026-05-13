---
summary: "Detailed packaging and local reinstall runbooks for WindieOS desktop builds across macOS, Windows, and Linux."
read_when:
  - When changing Electron Builder packaging, bundled Python runtime generation, release artifacts, or local reinstall helpers.
  - When debugging packaged app startup, missing sidecar runtime, signing, notarization, or OS-specific install state.
title: "Packaging and Reinstall Runbooks"
---

# Packaging and Reinstall Runbooks

WindieOS packaged builds are Electron apps with a bundled Python sidecar runtime. Packaging behavior is shared through `frontend/package.json` and `frontend/electron-builder.bundled-python.yml`; reinstall behavior is OS-specific because installed app paths, permissions, state reset, and installer formats differ.

## Packaging Command Map

Run from `frontend/`:

| Command | Builds | Notes |
| --- | --- | --- |
| `npm run package` | Default Electron Builder targets for current OS | Runs `build:sidecar-runtime` and frontend build first |
| `npm run package:mac` | macOS DMG and ZIP | Must run on macOS |
| `npm run package:win` | Windows NSIS installer | Must run on Windows |
| `npm run package:linux` | Linux AppImage, DEB, RPM | Must run on Linux |
| `npm run build:sidecar-runtime` | `frontend/python-runtime` and archive | Calls `../scripts/build-sidecar-runtime` |

Compatibility aliases:

- `package:win:bundled-python`
- `package:mac:bundled-python`
- `package:linux:bundled-python`

These currently forward to the platform package commands.

## Runtime Build Ownership

Primary files:

- `scripts/build-sidecar-runtime`
- `frontend/src/main/python/requirements.runtime.txt`
- `frontend/electron-builder.bundled-python.yml`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`

Runtime expectations:

- Build each runtime on its target OS.
- Packaged sidecar uses `resources/python-runtime`.
- Packaged app does not depend on conda, system Python, or build-machine venv paths.
- Packaged runtime ships bytecode-only sidecar sources.
- Packaged runtime does not prebundle Playwright Chromium.
- Browser automation prefers installed Chrome/Chromium-family browsers and only installs Chromium after user consent when needed.
- Wakeword model prefetch is required unless explicitly overridden with `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`.

## macOS Local Reinstall

Command:

```bash
./scripts/reinstall-windieos-macos.sh
```

What it does:

- Requires macOS and `npm`.
- Resolves the frontend Python build interpreter through `./scripts/python-in-env frontend python` unless `WINDIE_PYTHON_BUILD` is set.
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
.\scripts\reinstall-windieos-windows.ps1
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
- Runs `npm run package:win:bundled-python`.
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
./scripts/reinstall-windieos-linux.sh
```

What it does:

- Targets Debian/Ubuntu systems with `apt`.
- Requires `conda`, `npm`, and an executable Python build interpreter.
- Defaults Python build interpreter to `/home/peter/miniconda3/envs/frontend_jarvis/bin/python` unless `WINDIE_PYTHON_BUILD` is set.
- Stops running `windieos` processes.
- Purges installed `windieos` or `desktop-assistant-frontend` packages if present.
- Runs `sudo apt autoremove -y`.
- Cleans `release`, `dist`, `python-runtime`, and `python-runtime.tar.gz`.
- Runs `conda run -n frontend_jarvis npm ci`.
- Runs `npm run package:linux`.
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
| Packaged app cannot start sidecar | runtime path or bundled Python missing | `frontend/src/main/runtime_paths.cjs`, package contents under `resources/python-runtime`, sidecar logs |
| macOS local build hangs on signing/notarization | wrong path: using release signing instead of local reinstall | confirm reinstall helper strips `APPLE_*` and `CSC_*`; use ad-hoc local path |
| macOS app launches from copied install but not DMG | signing/hardened runtime/Gatekeeper path | `scripts/ci/smoke-macos-packages.sh`, [Release Guide](release.md) |
| Windows packaging fails extracting signing helper | symlink/developer mode | run reinstall helper preflight, enable Developer Mode or use elevated shell |
| Linux AppImage browser tools fail but DEB works | missing system package | verify `xdotool` installed for AppImage users |
| Packaged app connects to wrong backend | endpoint env/default resolution | [Runtime Configuration Matrix](runtime_configuration_matrix.md), `frontend/src/main/backend_endpoints.cjs` |
| Browser tool asks to install Chromium | no compatible system browser and no Playwright cache | [Browser Troubleshooting](../browser/browser_troubleshooting.md) |

## Validation Checklist

For packaging changes:

1. Run the package command on the target OS.
2. Inspect package contents for `resources/python-runtime`.
3. Launch installed app, not only the source Electron app.
4. Verify backend connectivity to the intended endpoint.
5. Verify one local tool call that exercises the sidecar.
6. Verify wakeword startup path if runtime packaging changed.
7. Run the matching `scripts/ci/smoke-*` helper where available.
8. Update [Sidecar Runtime Packaging](sidecar_runtime_packaging.md), [Packaged Desktop Builds](../install/packaged_desktop.md), and [Release Guide](release.md) when behavior changes.
