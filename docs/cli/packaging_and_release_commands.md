---
summary: "Packaging and release command guide for WindieOS bundled Python runtime builds, Electron package scripts, platform smoke helpers, local reinstall helpers, and release guardrails."
read_when:
  - When packaging WindieOS, changing release scripts, validating packaged app behavior, or choosing OS-specific package and reinstall commands.
  - When distinguishing local reinstall loops from signed/notarized release builds.
title: "Packaging and Release Commands"
---

# Packaging and Release Commands

Packaging commands are OS-sensitive. Build and smoke the target package on the target OS whenever possible.

Use [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md) before changing these commands, release workflow inputs, smoke scripts, or reinstall helpers.

Commands below use `<windie>` for the active platform shim: `bin\windie.cmd` on
Windows PowerShell and `bin/windie.sh` on Unix-like shells.

## Package Commands

Run from the repository root.

| Command | Purpose |
| --- | --- |
| `<windie> build frontend` | Build the Vite frontend bundle. |
| `<windie> build local-runtime` | Build bundled Python local-runtime payload. |
| `<windie> package mac` | Build macOS DMG/ZIP. |
| `<windie> package win` | Build Windows NSIS installer. |
| `<windie> package linux` | Build Linux AppImage/DEB/RPM. |

## Local Reinstall Helpers

| OS | Command |
| --- | --- |
| macOS | `<windie> reinstall mac` |
| Linux | `<windie> reinstall linux` |
| Windows | `<windie> reinstall win` |

Local macOS reinstall loops intentionally skip Apple notarization and release signing waits. Do not treat a local reinstall as release-signing validation.

## CI Smoke Helpers

| OS | Command |
| --- | --- |
| macOS | `scripts/ci/smoke-macos-packages.sh` |
| Linux | `scripts/ci/smoke-linux-packages.sh` |
| Windows | `scripts/ci/smoke-windows-packages.ps1` |

## Guardrails

- Do not change version numbers or publish artifacts without explicit approval.
- Run relevant tests before release steps.
- If UI is touched, include frontend lint/test/build checks when feasible.
- If bundled Python runtime files change, rebuild/smoke the bundled runtime on the target OS.
- Keep release signing credentials out of docs, tests, and committed config.

## Related Docs

- [Install Hub](../install/README.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md)
- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Release Guide](../operations/release.md)
