---
summary: "Packaged desktop build guide for Electron Builder, bundled local-runtime Python, and platform-specific package targets."
read_when:
  - When changing desktop packaging, bundled local-runtime Python, or reinstall scripts.
  - When preparing local package smoke checks.
title: "Packaged Desktop Builds"
---

# Packaged Desktop Builds

Packaged WindieOS builds are Electron apps with bundled local-runtime Python.
The current implementation starts local-runtime Python from that bundle; the
local-runtime Python process remains the concrete packaged entrypoint. Use
`<windie> ...` packaging commands from the repository root; they wrap the
frontend package tasks and bundled local-runtime Python builder before Electron
Builder.

Use [Install Decision Matrix](install_decision_matrix.md) before packaging if the change may be source-only. Packaged validation is required for bundled runtime paths, installed app paths, platform permissions, local reinstall helpers, and release artifacts.

For implementation work, start with [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md) before editing package scripts, runtime build helpers, smoke scripts, or release workflow files.

## Package Commands

From the repository root:

```bash
<windie> package mac
<windie> package win
<windie> package linux
```

Windows PowerShell can use `npm.cmd` when `npm.ps1` is blocked by execution
policy:

```powershell
<windie> package win
```

Windows package builds still need Bash because `<windie> build local-runtime`
calls `../scripts/build-sidecar-runtime`. Use Git Bash or ensure Bash is on
`PATH` before running the package command.

Package targets:

- macOS: DMG and ZIP
- Windows: NSIS
- Linux: AppImage, DEB, RPM

## Bundled Local-Runtime Python

The bundled local-runtime Python archive is built with:

```bash
<windie> build local-runtime
```

That command calls `../scripts/build-sidecar-runtime`. Runtime dependencies are listed under `frontend/src/main/python/requirements*.txt`.

## Local Reinstall Helpers

- macOS: `<windie> reinstall mac`
- Windows: `<windie> reinstall win`
- Linux: `<windie> reinstall linux`

For local macOS reinstall loops, skip notarization and use the local helper path rather than release signing.

See [Uninstall, Reinstall, and Reset](uninstall_reinstall_reset.md) for reset scope, helper options, and after-install smoke checks.

See [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md) for the detailed OS-specific behavior, reset scope, useful environment overrides, and debugging matrix.

## Smoke Checks

CI smoke helpers live under `scripts/ci/`:

- `smoke-macos-packages.sh`
- `smoke-windows-packages.ps1`
- `smoke-linux-packages.sh`

## Related Docs

- [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Release Guide](../operations/release.md)
- [Deployment](../operations/deployment.md)
