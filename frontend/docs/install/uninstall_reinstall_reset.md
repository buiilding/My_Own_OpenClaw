---
summary: "Uninstall, reinstall, and reset guide for WindieOS packaged app loops across macOS, Windows, and Linux."
read_when:
  - When a packaged WindieOS install needs to be reset, reinstalled, smoked, or compared with source-mode Electron behavior.
  - When changing local reinstall helpers, app-data reset scope, packaged run logs, or OS-specific install paths.
title: "Uninstall, Reinstall, and Reset"
---

# Uninstall, Reinstall, and Reset

Use reinstall helpers when you need to validate installed app behavior, reset stale local state, or prove a packaged runtime issue. Do not use manual deletion first; the helper scripts encode OS-specific install paths, app names, logs, state roots, and rebuild commands.

## Helper Map

| OS | Helper | Package path | Main reset behavior |
| --- | --- | --- | --- |
| macOS | `<windie> reinstall mac` | `/Applications/WindieOS.app` | stops app, resets known TCC/privacy grants, removes app copies and app state, rebuilds unpacked app, ad-hoc signs, launches, tails log |
| Windows | `<windie> reinstall win` | newest `*Setup*.exe` under `frontend/release` | stops app, runs existing uninstaller, removes install roots, resets app data unless skipped, packages NSIS installer, installs silently |
| Linux | `<windie> reinstall linux` | newest `release/windieos_*_amd64.deb` | stops app, purges installed packages, cleans runtime/build artifacts, packages Linux targets, installs DEB, verifies runtime Python |

## macOS Local Loop

```bash
<windie> reinstall mac
```

Useful overrides:

```bash
WINDIE_LOG_FILE=~/windieos-packaged-run.log \
WINDIE_SIDECAR_LOG_LEVEL=DEBUG \
<windie> reinstall mac
```

Important boundary:

- This is a fast local loop.
- It intentionally clears Apple signing/notarization variables.
- It uses ad-hoc signing.
- It does not validate downloaded-app Gatekeeper behavior.

## Windows Local Loop

```powershell
<windie> reinstall win
```

Useful options:

```powershell
<windie> reinstall win -SkipDataReset
<windie> reinstall win -SkipLaunch
```

The helper expects `npm` and Bash. If `bash` is not on `PATH`, it probes common Git Bash install paths.

## Linux Local Loop

```bash
<windie> reinstall linux
```

The helper targets Debian/Ubuntu systems with `apt`, packages Linux targets, installs the newest DEB, and verifies bundled runtime Python plus `_tkinter`.

## Reset Scope

| Reset target | macOS | Windows | Linux |
| --- | --- | --- | --- |
| installed app copy | yes | yes | package purge/install |
| local app data | yes | yes unless `-SkipDataReset` | package/app roots handled by helper |
| frontend build output | yes | yes | yes |
| bundled Python runtime | reused when stamp matches | rebuilt | rebuilt |
| OS permissions | known TCC grants reset | app data reset only | package state reset |
| signing/notarization | ad-hoc local only | installer behavior only | package install behavior only |

## After Reinstall

1. Confirm the installed app launches.
2. Confirm backend endpoint snapshot matches the intended host.
3. Send one prompt.
4. Run one local runtime-backed tool.
5. Check packaged logs for local-runtime startup/import failures.
6. If packaging changed, inspect package contents for `resources/python-runtime`.

## Related Docs

- [Packaged Desktop Builds](packaged_desktop.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- Process Health Checklist (private backend docs)
