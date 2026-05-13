---
summary: "Install hub for WindieOS local development, packaged desktop builds, sidecar runtime bundling, and platform reinstall helpers."
read_when:
  - When setting up or packaging WindieOS.
  - When changing install, build, or local reinstall flows.
title: "Install Hub"
---

# Install Hub

WindieOS install docs cover two different paths:

- local development, where backend/frontend/sidecar run from source
- packaged desktop builds, where Electron bundles the frontend and a Python sidecar runtime

## Install Pages

- [Local Development](local_development.md)
- [Packaged Desktop Builds](packaged_desktop.md)

## Main Commands

- Backend dev server: `./scripts/python-in-env backend python -m backend.src.main`
- Frontend Vite dev server: `cd frontend && npm run dev`
- Electron dev app: `cd frontend && npm run electron:dev`
- Frontend package build: `cd frontend && npm run package`
- Sidecar runtime build: `cd frontend && npm run build:sidecar-runtime`

## Related Docs

- [Platform Setup: Backend + Frontend](../getting-started/platform_setup_backend_frontend.md)
- [Installation Guide](../getting-started/installation.md)
- [Sidecar Runtime Packaging](../operations/sidecar_runtime_packaging.md)
- [Release Guide](../operations/release.md)
