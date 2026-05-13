---
summary: "Packaged desktop build guide for Electron Builder, bundled Python sidecar runtime, and platform-specific package targets."
read_when:
  - When changing desktop packaging, sidecar runtime bundling, or reinstall scripts.
  - When preparing local package smoke checks.
title: "Packaged Desktop Builds"
---

# Packaged Desktop Builds

Packaged WindieOS builds are Electron apps with a bundled Python sidecar runtime. Packaging commands live in `frontend/package.json` and call `scripts/build-sidecar-runtime` before Electron Builder.

## Package Commands

From `frontend/`:

```bash
npm run package
npm run package:mac
npm run package:win
npm run package:linux
```

Package targets:

- macOS: DMG and ZIP
- Windows: NSIS
- Linux: AppImage, DEB, RPM

## Sidecar Runtime

The bundled sidecar runtime is built with:

```bash
cd frontend
npm run build:sidecar-runtime
```

That command calls `../scripts/build-sidecar-runtime`. Runtime dependencies are listed under `frontend/src/main/python/requirements*.txt`.

## Local Reinstall Helpers

- macOS: `scripts/reinstall-windieos-macos.sh`
- Windows: `scripts/reinstall-windieos-windows.ps1`
- Linux: `scripts/reinstall-windieos-linux.sh`

For local macOS reinstall loops, skip notarization and use the local helper path rather than release signing.

See [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md) for the detailed OS-specific behavior, reset scope, useful environment overrides, and debugging matrix.

## Smoke Checks

CI smoke helpers live under `scripts/ci/`:

- `smoke-macos-packages.sh`
- `smoke-windows-packages.ps1`
- `smoke-linux-packages.sh`

## Related Docs

- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Release Guide](../operations/release.md)
- [Deployment](../operations/deployment.md)
