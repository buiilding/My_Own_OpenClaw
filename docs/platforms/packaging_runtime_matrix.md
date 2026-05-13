---
summary: "Cross-platform packaging and runtime matrix for WindieOS Electron Builder targets, bundled Python runtime, local reinstall helpers, smoke checks, and platform dependencies."
read_when:
  - When changing platform package targets, bundled Python runtime behavior, local reinstall helpers, smoke checks, or OS-specific release assumptions.
  - When debugging a packaged app that works on one OS but fails on another.
title: "Packaging Runtime Matrix"
---

# Packaging Runtime Matrix

Packaging is OS-native. Build and validate each runtime on the target OS because Electron packages, bundled Python binaries, signing, and OS dependencies do not transfer across platforms.

## Target Matrix

| Platform | Package command | Targets | Local reinstall helper | Smoke helper |
| --- | --- | --- | --- | --- |
| macOS | `cd frontend && npm run package:mac` | DMG, ZIP | `./scripts/reinstall-windieos-macos.sh` | `scripts/ci/smoke-macos-packages.sh` |
| Windows | `cd frontend && npm run package:win` | NSIS installer | `.\scripts\reinstall-windieos-windows.ps1` | `scripts/ci/smoke-windows-packages.ps1` |
| Linux | `cd frontend && npm run package:linux` | AppImage, DEB, RPM | `./scripts/reinstall-windieos-linux.sh` | `scripts/ci/smoke-linux-packages.sh` |

All package commands run `npm run build:sidecar-runtime` and `npm run build` before Electron Builder.

## Bundled Runtime Rules

- Bundled sidecar runtime lives under `resources/python-runtime`.
- Runtime dependencies come from `frontend/src/main/python/requirements.runtime.txt`.
- Runtime build owner is `scripts/build-sidecar-runtime`.
- Packaged sidecar should not depend on conda, system Python, or build-machine virtualenv paths.
- Build each bundled runtime on its target OS.
- Browser automation does not prebundle Playwright Chromium; it prefers installed Chrome/Chromium-family browsers.
- Wakeword model prefetch is required unless explicitly overridden with `WINDIE_REQUIRE_WAKEWORD_PREFETCH=0`.

## Platform-Specific Notes

| Platform | Packaging notes |
| --- | --- |
| macOS | local reinstall uses ad-hoc signing and strips Apple signing/notarization env vars; release path must handle signing/notarization and Mach-O runtime signing |
| Windows | NSIS packaging can be affected by Developer Mode/symlink helper extraction; reinstall helper probes Git Bash and Python choices |
| Linux | DEB/RPM package metadata can declare OS dependencies such as `xdotool`; AppImage users may need to install them manually |

## Validation

For platform packaging changes:

1. Run `cd frontend && npm run build:sidecar-runtime`.
2. Run the platform package command on the target OS.
3. Inspect package contents for `resources/python-runtime`.
4. Launch the installed app, not only Electron dev.
5. Send a prompt.
6. Execute one sidecar-backed local tool.
7. Verify backend endpoint selection.
8. Run the matching smoke helper where available.

## Related Docs

- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
