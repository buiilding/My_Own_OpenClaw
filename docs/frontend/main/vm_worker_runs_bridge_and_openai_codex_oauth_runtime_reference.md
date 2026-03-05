---
summary: "Deep reference for Electron VM worker run-bridge runtime and OpenAI Codex OAuth PKCE IPC flow."
read_when:
  - When changing VM mode worker heartbeat/dispatch behavior in Electron main.
  - When changing OpenAI Codex OAuth login/logout IPC handlers or token payload contracts.
title: "VM Worker Runs Bridge and OpenAI Codex OAuth Runtime Reference"
---

# VM Worker Runs Bridge and OpenAI Codex OAuth Runtime Reference

## Scope

This page documents two Electron-main runtime slices:

- VM worker orchestration bridge:
  - `frontend/src/main/vm_worker_runtime.cjs`
  - `frontend/src/main/runtime_mode.cjs`
  - startup wiring in `frontend/src/main/index.cjs`
- OpenAI Codex OAuth flow:
  - `frontend/src/main/openai_codex_oauth.cjs`
  - IPC handlers in `frontend/src/main/ipc.cjs`

## VM Mode and Worker Activation

Mode gates (`runtime_mode.cjs`):

- `isVmModeEnabled(env)` -> true only when `WINDIE_VM_MODE == "1"`.
- `isVmWorkerModeEnabled(env)`:
  - if `WINDIE_VM_WORKER_MODE` absent, inherits VM mode.
  - else true only when `WINDIE_VM_WORKER_MODE == "1"`.

Bootstrap in `index.cjs`:

- VM mode adds `vm_mode=1` query parameter when loading renderer window URL/file.
- When worker mode is enabled, main process creates one VM worker runtime and starts/stops it with app lifecycle.

## VM Worker Runtime Contract

`createVmWorkerRuntime(...)` requires injected callbacks:

- `getBackendConnectionState`
- `sendAutomatedQuery`
- `registerBackendMessageObserver`
- optional `sendMessageToBackend` for control command application

Optional env inputs:

- `WINDIE_VM_WORKSPACE_ID` (default `default-workspace`)
- `WINDIE_VM_WORKER_ID` (else derived `worker-${userId}`)
- `WINDIE_VM_ID` (else derived `vm-${workerId}`)
- `WINDIE_VM_AGENT_ID`
- `WINDIE_VM_WORKER_HEARTBEAT_MS` (min 1000ms, default 5000ms)
- runs API key resolution (first non-empty):
  - `WINDIE_VM_RUNS_API_KEY`
  - `WINDIE_RUNS_API_KEY`
  - `WINDIE_DEMO_API_KEY`

If key resolves, worker includes `x-windie-runs-key` on all `/api/runs/*` HTTP calls.

## Heartbeat Tick Loop

Every interval (plus immediate first tick), runtime:

1. Reads backend connection state.
2. Skips tick unless websocket is connected and `backendHttpUrl` + `userId` are available.
3. Posts `POST /api/runs/workers/heartbeat` with worker/session status.
4. Applies returned `control_commands`.
5. Dispatches one `assigned_run` when present.

Guardrails:

- `inTick` prevents overlapping heartbeat requests.
- Runtime no-ops safely on malformed command/run payloads.

## Assigned Run Dispatch Path

For assigned runs, runtime:

1. Validates `run_id`, `conversation_ref`, `query`.
2. Normalizes `files[]` and builds multiline attachment context from artifact refs.
3. Calls `sendAutomatedQuery({ text, conversationRef, attachmentContext, attachmentFilenames })`.
4. On success:
  - stores mapping `conversation_ref <-> run_id`
  - acks `POST /api/runs/{run_id}/worker-dispatched` with `turn_ref`
5. On failure:
  - writes error event to `POST /api/runs/{run_id}/events` with `event_type="error"`.

## Backend Stream Relay Path

Runtime subscribes to backend messages via `registerBackendMessageObserver`.

For active mapped runs:

- forwards stream envelopes to `POST /api/runs/{run_id}/events` with:
  - `event_type = backend type`
  - payload includes nested original event payload plus `conversation_ref`, `turn_ref`, `session_id`, `user_id`
- clears run mapping after terminal `streaming-complete` or `error`.

## Control Command Application

Current implementation only executes `stop` controls:

- resolves run -> conversation mapping
- sends websocket message `type="stop-query"` with `{ conversation_ref }`
- emits run timeline event `run-control-applied` to `/api/runs/{run_id}/events`

Other command actions are ignored by worker runtime today.

## OpenAI Codex OAuth Runtime

Main process exposes IPC handlers in `ipc.cjs`:

- `openai-codex-oauth-login`
- `openai-codex-oauth-logout`

Renderer calls these through `INVOKE_CHANNELS.OPENAI_CODEX_OAUTH_LOGIN/LOGOUT`.

### Login Flow (PKCE + Local Callback)

`loginOpenAICodexOAuth(...)` sequence:

1. Generate PKCE verifier/challenge and random `state`.
2. Start local HTTP callback server on `127.0.0.1:1455` (`/auth/callback`).
3. Build authorize URL at `${issuer}/oauth/authorize` with:
  - `client_id` (default `app_EMoamEEZ73f0CkXaXp7hrann`)
  - scope `openid profile email offline_access api.model.audio.request`
  - PKCE + state + originator metadata
4. Open external browser via Electron `shell.openExternal`.
5. Validate callback state and exchange `code` at `${issuer}/oauth/token`.
6. Build normalized token payload:
  - `connected`, `access_token`, `refresh_token`, `expires_at`, `profile_id`

Timeout/failure behavior:

- Callback timeout: 10 minutes.
- Invalid state/code or token-exchange failure returns `{ success:false, error }` via IPC.

### Token Normalization Details

- `expires_at` prefers `expires_in`; falls back to JWT `exp` claim.
- `profile_id` uses `chatgpt_account_id` claim when available; falls back to `openai-codex:default`.

### Logout Flow

`logoutOpenAICodexOAuth()` returns a normalized success envelope (currently local-state only, no remote revoke).

## Renderer Integration Points

- `ModelsSection.jsx` invokes OAuth login/logout IPC and writes resulting token state into `config.provider_oauth.openai_codex`.
- VM-mode renderer helper `renderer/infrastructure/runtime/vmMode.js` reads URL query `vm_mode=1` for surface behavior toggles.

## Test Coverage Pointers

- VM worker runtime tests: `tests/frontend/VmWorkerRuntime.test.cjs`
- Runtime mode env tests: `tests/frontend/RuntimeMode.test.cjs`
