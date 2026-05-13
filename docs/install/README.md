---
summary: "Install hub for WindieOS local development, packaged desktop builds, endpoint setup, reinstall/reset loops, sidecar runtime bundling, and install troubleshooting."
read_when:
  - When setting up or packaging WindieOS.
  - When changing install, build, or local reinstall flows.
title: "Install Hub"
---

# Install Hub

WindieOS install docs cover source-mode development, packaged desktop validation, backend endpoint selection, and OS-specific reinstall loops.

- source development, where backend/frontend/sidecar run from the checkout
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
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)

## Main Commands

- Backend dev server: `./scripts/python-in-env backend python -m backend.src.main`
- Frontend Vite dev server: `cd frontend && npm run dev`
- Electron dev app: `cd frontend && npm run electron:dev`
- Frontend package build: `cd frontend && npm run package`
- Sidecar runtime build: `cd frontend && npm run build:sidecar-runtime`

## Related Docs

- [Platform Setup: Backend + Frontend](../getting-started/platform_setup_backend_frontend.md)
- [Installation Guide](../getting-started/installation.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Release Guide](../operations/release.md)
