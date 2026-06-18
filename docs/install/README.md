---
summary: "Install hub for WindieOS local development, packaged desktop builds, endpoint setup, reinstall/reset loops, sidecar runtime bundling, and install troubleshooting."
read_when:
  - When setting up or packaging WindieOS.
  - When changing install, build, or local reinstall flows.
title: "Install Hub"
---

# Install Hub

WindieOS install docs cover source-mode development, packaged desktop validation, backend endpoint selection, and OS-specific reinstall loops.

- source development, where backend, renderer, and sidecar runtimes run from the checkout
- packaged desktop builds, where Electron bundles the frontend and a Python sidecar runtime
- endpoint setup, where the app targets Peter-hosted, local, staging, or self-hosted backend routes
- reinstall/reset loops, where installed app state and packaged resource paths matter

## Install Pages

- [Install Decision Matrix](install_decision_matrix.md)
- [Local Development](local_development.md)
- [Packaged Desktop Builds](packaged_desktop.md)
- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Uninstall, Reinstall, and Reset](uninstall_reinstall_reset.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)

## Main Commands

- Backend dev server: `bin/windie start backend`
- Desktop dev loop: `bin/windie start dev`
- Customer-mode desktop loop: `bin/windie start customer`
- Focused Vite dev server: `bin/windie start frontend`
- Focused Electron dev app: `bin/windie start desktop`
- Frontend package build: `bin/windie package mac`, `bin/windie package win`, or `bin/windie package linux`
- Sidecar runtime build: `bin/windie build sidecar-runtime`
- Command health summary: `bin/windie status --all`
- Diagnostic pass: `bin/windie doctor --deep`

The lower-level scripts and frontend npm tasks still exist as implementation
adapters, but user-facing docs should prefer the `bin/windie ...` command
surface.

## Related Docs

- [Platform Setup: Backend + Frontend](../getting-started/platform_setup_backend_frontend.md)
- [Installation Guide](../getting-started/installation.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Release and Packaging Change Workflow](../operations/release_packaging_change_workflow.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Release Guide](../operations/release.md)
