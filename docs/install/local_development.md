---
summary: "Local development setup for WindieOS backend, frontend, Electron app, sidecar, tests, and environment launcher."
read_when:
  - When setting up WindieOS for source development.
  - When changing developer commands or environment assumptions.
title: "Local Development"
---

# Local Development

Use the repository scripts instead of manually activating conda environments. `./scripts/python-in-env` selects the expected environment when it exists and falls back to the current shell environment otherwise.

Use [Install Decision Matrix](install_decision_matrix.md) first when you are not sure whether source mode is sufficient. Source mode is the right loop for backend/frontend/sidecar implementation, but not for bundled runtime, installed app path, signing, or OS permission validation.

## Prerequisites

- Python 3.11
- Node 18+
- Backend conda env name: `jarvis`
- Frontend/sidecar conda env name: `frontend_jarvis`

## Install

```bash
pip install -r backend/requirements.txt
cd frontend
npm install
```

Windows PowerShell may resolve `npm` to `npm.ps1`, which can fail under the
default execution policy. In that case, use the command shim explicitly:

```powershell
cd frontend
npm.cmd install
```

## Run

```bash
./scripts/python-in-env backend python -m backend.src.main
cd frontend && npm run dev
cd frontend && npm run electron:dev
```

Windows PowerShell equivalents:

```powershell
.\scripts\python-in-env backend python -m backend.src.main
cd frontend; npm.cmd run dev
cd frontend; npm.cmd run electron:dev
```

To force Electron dev to use the local backend:

```bash
cd frontend
BACKEND_HTTP_URL=http://127.0.0.1:8765 \
BACKEND_WS_URL=ws://127.0.0.1:8765/ws \
npm run electron:dev
```

Windows PowerShell:

```powershell
cd frontend
$env:BACKEND_HTTP_URL = "http://127.0.0.1:8765"
$env:BACKEND_WS_URL = "ws://127.0.0.1:8765/ws"
npm.cmd run electron:dev
```

Convenience scripts also exist:

- `scripts/run-backend`
- `scripts/run-frontend-dev`
- `scripts/run-frontend-electron`

## Test

```bash
./scripts/test-backend
./scripts/test-sidecar
cd frontend && npm run test
cd frontend && npm run test:ci
cd frontend && npm run lint
```

Windows PowerShell:

```powershell
.\scripts\test-backend
.\scripts\test-sidecar
cd frontend; npm.cmd run test
cd frontend; npm.cmd run test:ci
cd frontend; npm.cmd run lint
```

## Docs

Run `./bin/docs-list` from the repo root before implementation work. If `bin/docs-list` is missing, use `node scripts/docs-list.js`.

Windows PowerShell can use either `.\bin\docs-list.cmd` or
`node .\scripts\docs-list.js`.

## Related Docs

- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Validation Commands](../cli/validation_commands.md)
