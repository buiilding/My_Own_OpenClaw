---
summary: "Local development setup for WindieOS backend, frontend, Electron app, local-runtime implementation, tests, and environment launcher."
read_when:
  - When setting up WindieOS for source development.
  - When changing developer commands or environment assumptions.
title: "Local Development"
---

# Local Development

Use `<windie> ...` from the repository root instead of manually activating
conda environments or invoking lower-level launch scripts directly.
`scripts\python-in-env.cmd` on Windows PowerShell and
`./scripts/python-in-env.sh` on Unix-like shells remain the low-level Python
environment adapters for
focused Python commands.

Use [Install Decision Matrix](install_decision_matrix.md) first when you are not sure whether source mode is sufficient. Source mode is the right loop for backend, renderer, and local-runtime implementation, but not for bundled runtime, installed app path, signing, or OS permission validation.

## Prerequisites

- Python 3.11
- Node 18+
- Backend conda env name: `jarvis`
- Frontend/local-runtime implementation conda env name: `frontend_jarvis`

## Install

```bash
pip install -r backend/requirements.txt
(cd frontend && npm install)
(cd packages/windie-sdk-js && npm install)
```

Windows PowerShell may resolve `npm` to `npm.ps1`, which can fail under the
default execution policy. In that case, use the command shim explicitly:

```powershell
cd frontend
npm.cmd install
```

## Run

```bash
<windie> start backend
<windie> start dev
```

`<windie> start dev` checks source-mode Node installs before launching. When a
new worktree is missing `frontend/node_modules` or the SDK-owned
`packages/windie-sdk-js/node_modules/ws` websocket dependency, the command runs
`npm install` in the owning package and then continues startup.

Windows PowerShell equivalents:

```powershell
<windie> start backend
<windie> start dev
```

To force Electron dev to use an explicit local backend origin:

```bash
BACKEND_HTTP_URL=http://127.0.0.1:8765 \
BACKEND_WS_URL=ws://127.0.0.1:8765/ws \
<windie> start dev
```

Windows PowerShell:

```powershell
$env:BACKEND_HTTP_URL = "http://127.0.0.1:8765"
$env:BACKEND_WS_URL = "ws://127.0.0.1:8765/ws"
<windie> start dev
```

Convenience scripts also exist:

- `<windie> start backend`
- `<windie> start frontend`
- `<windie> start desktop`
- `<windie> start dev`

## Test

```bash
<windie> test backend
<windie> test local-runtime
<windie> test frontend
cd frontend && npm run lint
```

Windows PowerShell:

```powershell
<windie> test backend
<windie> test local-runtime
<windie> test frontend
cd frontend; npm.cmd run lint
```

## Docs

Run `<windie> docs list` from the repo root before implementation work.

## Related Docs

- [Backend Endpoint Setup](local_backend_and_endpoint_setup.md)
- [Install Troubleshooting](install_troubleshooting.md)
- [Validation Commands](../cli/validation_commands.md)
