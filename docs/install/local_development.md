---
summary: "Local development setup for WindieOS backend, frontend, Electron app, sidecar, tests, and environment launcher."
read_when:
  - When setting up WindieOS for source development.
  - When changing developer commands or environment assumptions.
title: "Local Development"
---

# Local Development

Use `bin/windie ...` from the repository root instead of manually activating
conda environments or invoking lower-level launch scripts directly.
`./scripts/python-in-env` remains the low-level Python environment adapter for
focused Python commands.

Use [Install Decision Matrix](install_decision_matrix.md) first when you are not sure whether source mode is sufficient. Source mode is the right loop for backend/frontend/sidecar implementation, but not for bundled runtime, installed app path, signing, or OS permission validation.

## Prerequisites

- Python 3.11
- Node 18+
- Backend conda env name: `jarvis`
- Frontend/sidecar conda env name: `frontend_jarvis`

## Install

```bash
pip install -r backend/requirements.txt
(cd frontend && npm install)
```

Windows PowerShell may resolve `npm` to `npm.ps1`, which can fail under the
default execution policy. In that case, use the command shim explicitly:

```powershell
cd frontend
npm.cmd install
```

## Run

```bash
bin/windie start backend
bin/windie start frontend
bin/windie start desktop
```

Windows PowerShell equivalents:

```powershell
bin/windie start backend
bin/windie start frontend
bin/windie start desktop
```

To force Electron dev to use the local backend:

```bash
BACKEND_HTTP_URL=http://127.0.0.1:8765 \
BACKEND_WS_URL=ws://127.0.0.1:8765/ws \
bin/windie start desktop
```

Windows PowerShell:

```powershell
$env:BACKEND_HTTP_URL = "http://127.0.0.1:8765"
$env:BACKEND_WS_URL = "ws://127.0.0.1:8765/ws"
bin/windie start desktop
```

Convenience scripts also exist:

- `bin/windie start backend`
- `bin/windie start frontend`
- `bin/windie start desktop`

## Test

```bash
bin/windie test backend
bin/windie test sidecar
bin/windie test frontend
cd frontend && npm run lint
```

Windows PowerShell:

```powershell
bin/windie test backend
bin/windie test sidecar
bin/windie test frontend
cd frontend; npm.cmd run lint
```

## Docs

Run `bin/windie docs list` from the repo root before implementation work.

## Related Docs

- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Validation Commands](../cli/validation_commands.md)
