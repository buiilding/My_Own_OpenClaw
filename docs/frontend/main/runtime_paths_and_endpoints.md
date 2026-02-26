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
- `frontend/src/main/ipc_frontend_config.cjs`
- `frontend/src/main/ipc.cjs`

## Backend Endpoint Resolution

`resolveBackendEndpoints(env)` derives the websocket and HTTP base URLs for main process relays.

Supported env vars (priority order):

- `BACKEND_WS_URL`
- `BACKEND_HTTP_URL`
- fallback pair: `BACKEND_HOST` + `BACKEND_PORT`
- packaged fallback override pair:
  - `WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL`
  - `WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL`

Defaults when explicit `BACKEND_*` is unset:

- Dev/source runs:
  - host: `127.0.0.1`
  - port: `8765`
  - http: `http://127.0.0.1:8765`
  - ws: `ws://127.0.0.1:8765/ws`
- Packaged runs:
  - http: `https://api.windieos.com`
  - ws: `wss://api.windieos.com/ws`
  - or `WINDIE_DEFAULT_PACKAGED_BACKEND_*` when set

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

## Python Runtime and Script Resolution

Main process uses `runtime_paths.cjs` helpers.

### `resolvePythonExecutablePath()`

Resolution order:

1. `WINDIE_PYTHON_PATH` if exists
2. bundled runtime candidates (packaged app)
3. active conda env (`CONDA_PREFIX`) python
4. fallback command (`py` on Windows, `python3` elsewhere)

Bundled runtime candidate roots:

- `<resources>/python-runtime`
- `<resources>/python`

### `resolvePythonScriptPath(scriptName)`

Dev vs packaged behavior:

- packaged: checks `app.asar.unpacked/src/main/python/<scriptName>` first, then `<resources>/python/<scriptName>`
- dev: `frontend/src/main/python/<scriptName>`

Purpose:

- avoids executing scripts from `app.asar` archive directly
- keeps sidecar launch working in production installers

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
- local sidecar bridge and wakeword bridge spawn Python scripts via runtime-path helpers

## Operational Debug Checklist

If backend relay fails:

1. inspect effective endpoint envs (`BACKEND_WS_URL`, `BACKEND_HTTP_URL`, host/port)
2. verify `resolveBackendEndpoints` output shape and protocol
3. confirm ws handshake origin compatibility (`wsOrigin`)

If sidecar fails to start in packaged builds:

1. verify unpacked python scripts exist under `app.asar.unpacked`
2. verify bundled python executable exists under `resources/python-runtime` or `resources/python`
3. check `WINDIE_PYTHON_PATH` overrides and file existence

If settings persistence fails:

1. verify writable `app.getPath('userData')`
2. check for stale `.tmp` file or JSON parse errors in `frontend-config.json`
