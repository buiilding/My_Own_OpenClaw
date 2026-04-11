---
summary: "Electron main runtime path and endpoint resolution: backend ws/http URL derivation, packaged-sidecar python path lookup, and frontend config persistence location."
read_when:
  - When changing backend endpoint env vars or ws/http URL derivation.
  - When debugging packaged-build Python script/runtime resolution or frontend config disk location.
title: "Runtime Paths and Endpoints"
---

# Runtime Paths and Endpoints

## Canonical Modules

- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/runtime_mode.cjs`
- `frontend/src/main/vm_worker_runtime.cjs`

## Backend Endpoint Resolution

`resolveBackendEndpoints(env)` derives the websocket and HTTP base URLs for main process relays.

Supported env vars (priority order):

- `BACKEND_WS_URL`
- `BACKEND_HTTP_URL`
- explicit endpoint override pair: `BACKEND_HOST` + `BACKEND_PORT`
- hosted-default override pair:
  - `WINDIE_DEFAULT_BACKEND_HTTP_URL`
  - `WINDIE_DEFAULT_BACKEND_WS_URL`
- packaged fallback override pair:
  - `WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL`
  - `WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL`

Defaults when explicit `BACKEND_*` is unset:

- Dev/source runs:
  - primary hosted candidate:
    - http: `https://api.windieos.com`
    - ws: `wss://api.windieos.com/ws`
- Packaged runs:
  - primary hosted candidate:
    - http: `https://api.windieos.com`
    - ws: `wss://api.windieos.com/ws`
    - or `WINDIE_DEFAULT_BACKEND_*` / `WINDIE_DEFAULT_PACKAGED_BACKEND_*` when set

Normalization rules:

- strips query/hash components
- trims trailing slash
- validates explicit protocol per channel (`http/https` for HTTP, `ws/wss` for WS)
- when only HTTP is provided, WS is derived by protocol swap + `/ws`
- when only WS is provided, HTTP is derived by inverse protocol swap and `/ws` path collapse

Returned object:

- `httpUrl`
- `wsUrl`
- `wsOrigin` (set to `httpUrl` for ws client origin header)

`resolveBackendEndpointCandidates(env, { isPackaged })` returns the ordered candidate list
used by the IPC websocket bridge:

- source runs: hosted default only
- packaged runs: hosted default only
- explicit `BACKEND_*` or host/port overrides collapse the list to the explicit target

## VM Worker Endpoint Consumption

When VM worker mode is enabled (`WINDIE_VM_MODE` / `WINDIE_VM_WORKER_MODE`), main-process worker runtime calls:

- `POST {backendHttpUrl}/api/runs/workers/heartbeat`
- `POST {backendHttpUrl}/api/runs/{run_id}/worker-dispatched`
- `POST {backendHttpUrl}/api/runs/{run_id}/events`

Optional runs auth header:

- if any are set, first non-empty value is used for `x-windie-runs-key`:
  - `WINDIE_VM_RUNS_API_KEY`
  - `WINDIE_RUNS_API_KEY`
  - `WINDIE_DEMO_API_KEY`

## Python Runtime and Script Resolution

Main process uses `runtime_paths.cjs` helpers.

### `resolvePythonExecutablePath()`

Resolution order:

1. `WINDIE_PYTHON_PATH` if exists
2. bundled runtime candidates (packaged app)
3. dev-only fallback: active conda env (`CONDA_PREFIX`) python
4. dev-only fallback command (`py` on Windows, `python3` elsewhere)

Packaged guardrail:

- packaged apps do not fall back to user/system Python.
- if bundled Python is missing, resolver returns `null` and launch callers fail closed with reinstall guidance.

Bundled runtime candidate roots:

- `<resources>/python-runtime`
- `<resources>/python`

### `resolveSidecarLaunchTarget(scriptName)`

This is the canonical sidecar launch resolver used by both:

- `local_backend_bridge.cjs`
- `wakeword_bridge.cjs`

Resolution behavior:

1. packaged binary-first lookup:
  - `<resources>/sidecar-bin/<service>[.exe]`
  - `<resources>/sidecar-bin/<service>/<service>[.exe]`
2. fallback python launch target:
  - command: `resolvePythonExecutablePath()`
  - script path:
    - packaged: `<resources>/python-runtime/sidecar/<script>.pyc`
    - dev: `frontend/src/main/python/<script>.py`

Returned launch target object:

- `kind`: `binary` or `python`
- `command`, `args`, `cwd`, `resolvedPath`

## Frontend Config Persistence Path

`ipc_frontend_config.cjs` stores renderer config at:

- `path.join(app.getPath('userData'), 'frontend-config.json')`

Write behavior (`saveFrontendConfigToDisk`):

- validates config is object
- ensures parent directory exists
- writes temp file (`.tmp`) then renames atomically

Read behavior (`loadFrontendConfigFromDisk`):

- returns `null` when file missing or invalid/non-object JSON
- logs load failures but does not crash startup

## Where These Values Are Used

- `ipc.cjs` initializes:
- `BACKEND_URL` for websocket client
- `BACKEND_HTTP_URL` for artifact upload route
- `load-frontend-config` / `save-frontend-config` invoke handlers
- VM worker HTTP calls to `/api/runs/*` consume resolved `backendHttpUrl`
- local backend and wakeword bridges consume `resolveSidecarLaunchTarget(...)`

## Operational Debug Checklist

If backend relay fails:

1. inspect effective endpoint envs (`BACKEND_WS_URL`, `BACKEND_HTTP_URL`, host/port)
2. verify `resolveBackendEndpoints` output shape and protocol
3. confirm ws handshake origin compatibility (`wsOrigin`)

If sidecar fails to start in packaged builds:

1. verify bundled sidecar binary exists under `resources/sidecar-bin` (if using binary launch path)
2. if python launch path is used, verify bundled `.pyc` exists under `resources/python-runtime/sidecar`
3. verify bundled python executable exists under `resources/python-runtime` or `resources/python`
4. check `WINDIE_PYTHON_PATH` overrides and file existence in dev mode

If settings persistence fails:

1. verify writable `app.getPath('userData')`
2. check for stale `.tmp` file or JSON parse errors in `frontend-config.json`

If wakeword startup/readiness behaves inconsistently:

1. verify `resolveSidecarLaunchTarget('wakeword_service.py')` output
2. verify packaged-vs-dev error mapping in `wakeword_bridge_runtime.cjs`
3. verify stderr status lines are parsed through helper-level filter/emit paths
