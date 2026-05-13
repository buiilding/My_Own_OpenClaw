---
summary: "Packaging and release command guide for WindieOS sidecar runtime builds, Electron package scripts, platform smoke helpers, local reinstall helpers, and release guardrails."
read_when:
  - When packaging WindieOS, changing release scripts, validating packaged app behavior, or choosing OS-specific package and reinstall commands.
  - When distinguishing local reinstall loops from signed/notarized release builds.
title: "Packaging and Release Commands"
---

# Packaging and Release Commands

Packaging commands are OS-sensitive. Build and smoke the target package on the target OS whenever possible.

## Frontend Package Commands

Run from `frontend/`.

| Command | Purpose |
| --- | --- |
| `npm run build:sidecar-runtime` | Build bundled Python sidecar runtime via `../scripts/build-sidecar-runtime`. |
| `npm run package` | Build sidecar runtime, Vite frontend, and Electron package using `electron-builder.bundled-python.yml`. |
| `npm run package:mac` | Build macOS DMG/ZIP. |
| `npm run package:win` | Build Windows NSIS installer. |
| `npm run package:linux` | Build Linux AppImage/DEB/RPM. |

## Local Reinstall Helpers

| OS | Command |
| --- | --- |
| macOS | `./scripts/reinstall-windieos-macos.sh` |
| Linux | `./scripts/reinstall-windieos-linux.sh` |
| Windows | `./scripts/reinstall-windieos-windows.ps1` |

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
- If sidecar runtime files change, rebuild/smoke the bundled runtime on the target OS.
- Keep release signing credentials out of docs, tests, and committed config.

## Related Docs

- [Install Hub](../install/README.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Release Guide](../operations/release.md)
