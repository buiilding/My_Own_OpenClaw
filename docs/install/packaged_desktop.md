---
summary: "Packaged desktop build guide for Electron Builder, bundled Python sidecar runtime, and platform-specific package targets."
read_when:
  - When changing desktop packaging, sidecar runtime bundling, or reinstall scripts.
  - When preparing local package smoke checks.
title: "Packaged Desktop Builds"
---

# Packaged Desktop Builds

Packaged WindieOS builds are Electron apps with a bundled Python sidecar runtime. Packaging commands live in `frontend/package.json` and call `scripts/build-sidecar-runtime` before Electron Builder.

Use [Install Decision Matrix](install_decision_matrix.md) before packaging if the change may be source-only. Packaged validation is required for bundled runtime paths, installed app paths, platform permissions, local reinstall helpers, and release artifacts.

For implementation work, start with [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md) before editing package scripts, runtime build helpers, smoke scripts, or release workflow files.

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

See [Uninstall, Reinstall, and Reset](uninstall_reinstall_reset.md) for reset scope, helper options, and after-install smoke checks.

See [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md) for the detailed OS-specific behavior, reset scope, useful environment overrides, and debugging matrix.

## Smoke Checks

CI smoke helpers live under `scripts/ci/`:

- `smoke-macos-packages.sh`
- `smoke-windows-packages.ps1`
- `smoke-linux-packages.sh`

## Related Docs

- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Release Guide](../operations/release.md)
- [Deployment](../operations/deployment.md)
