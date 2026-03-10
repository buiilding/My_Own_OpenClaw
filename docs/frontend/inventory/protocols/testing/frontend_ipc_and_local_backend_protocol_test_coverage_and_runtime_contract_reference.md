---
summary: "Deep frontend protocol test reference mapping renderer IPC validation, websocket/query lifecycle behavior, split main-process IPC registrar ownership, local-backend bridge contracts, and wakeword restart safety to concrete tests."
read_when:
  - When changing `frontend/src/main/ipc.cjs` query send behavior, settings-ack gating, or outbound payload normalization.
  - When changing renderer IPC channel guards, split main-process IPC registrars, local-backend JSON-RPC parameter mapping, or wakeword process/buffer lifecycle handling.
title: "Frontend IPC and Local-Backend Protocol Test Coverage and Runtime Contract Reference"
---

# Frontend IPC and Local-Backend Protocol Test Coverage and Runtime Contract Reference

## Coverage Snapshot (2026-03-07)

- Protocol test files in this reference: `16`
- Total test cases across listed files: `175`

## Scope and Sources

Primary runtime modules:

- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/display_query_handler.cjs`

Primary protocol tests:

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/QueryPayloadBuilder.test.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`
- `tests/frontend/AgentSudoAccessHandler.test.cjs`
- `tests/frontend/PermissionService.test.cjs`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `tests/frontend/OverlayPhaseIpcRuntime.test.cjs`
- `tests/frontend/WindowControlsIpcRuntime.test.cjs`
- `tests/frontend/PermissionIpcRuntime.test.cjs`
- `tests/frontend/DisplayQueryHandler.test.cjs`

## Contract Coverage Matrix

| Contract Area | Runtime Owner | Key Tests | Verified Guarantees |
|---|---|---|---|
| renderer-side channel guard policy | `IpcBridge` (`bridge.ts`) | `IpcBridgeValidation.test.ts` | invalid channels throw in development; production skips guard checks and passes through to preload API |
| query-send orchestration + fallback eventing | `ipcMain.on('to-backend')` + helpers (`ipc.cjs`) | `IpcMainBridge.query.test.cjs` | overlay pre-capture hook runs only for chatbox-origin sends; disconnected send synthesizes renderer-visible `error` event |
| settings ACK gate before query | settings sync logic (`ipc.cjs`) | settings-gate tests in `IpcMainBridge.query.test.cjs` | first query waits for initial `update-settings` ACK when cached config exists; pending renderer settings ACK blocks query send |
| outbound payload normalization | `normalizeBackendPayload` (`ipc.cjs`) | screenshot-strip test in `IpcMainBridge.query.test.cjs` | client-supplied `screenshot_url` removed from outbound `query` payload while keeping `screenshot_ref` |
| query-context enrichment + escaping | `buildQueryPayloadContent` (`query_payload_builder.cjs`) | `QueryPayloadBuilder.test.cjs` + xml/escape tests in `IpcMainBridge.query.test.cjs` | system context + memories merged into XML-like content; XML-sensitive values escaped; fallback context/memory blocks used on upstream failure |
| conversation-ref fallback lifecycle | `currentConversationRef` handling (`ipc.cjs`) | conversation-ref tests in `IpcMainBridge.query.test.cjs` | backend-streamed `conversation_ref` backfills local echo + outbound query; reconnect clears stale fallback before next turn |
| local backend process lifecycle safety | process state/reset + readiness tokening (`local_backend_bridge.cjs`) | `LocalBackendBridge.lifecycle.test.cjs` | in-flight RPCs resolve with standardized errors on exit/error; stale readiness timers from old process generations do not clobber new process state |
| local backend RPC shape mapping | handler registration + mapper utilities (`local_backend_bridge.cjs`) | `LocalBackendBridge.rpc.test.cjs` | IPC payload keys map to backend snake_case params; non-object payloads normalize safely; error responses use canonical `{success:false,error}` shape |
| overlay IPC registrar ownership boundary | `overlay_phase_ipc_runtime.cjs` | `OverlayPhaseIpcRuntime.test.cjs` | overlay phase module registers only overlay-owned channels (`set-responsebox-size`, `set-chatbox-visual-anchor-height`, `show-chatbox`, `hide-chatbox`, `move-chatbox-to`) and does not own deprecated focus/interactivity channels |
| window-control IPC registrar + display mapping | `window_controls_ipc_runtime.cjs`, `display_query_handler.cjs` | `WindowControlsIpcRuntime.test.cjs`, `DisplayQueryHandler.test.cjs` | `show-main-window` normalization/route emit stays in window-control module; display inventory payload is mapped to stable `{ id, label, isPrimary, bounds, scaleFactor }` |
| permission/sudo IPC registrar ownership | `permission_ipc_runtime.cjs` | `PermissionIpcRuntime.test.cjs` | permission and sudo invoke handlers are registered in the permission runtime module and remain isolated from overlay/window channels |
| wakeword stream/restart robustness | wakeword subprocess + framed parser (`wakeword_bridge.cjs`) | `WakewordBridge.test.cjs` | detection callback + renderer event fire only when enabled; process restarts keep callback wiring; stale stdout/stderr partial buffers are cleared across restarts |
| wakeword helper runtime normalization | helper runtime (`wakeword_bridge_runtime.cjs`) | `WakewordBridgeRuntime.test.cjs` | packaged-vs-dev startup error mapping, ENOENT process error guidance, stderr ready-status promotion, and audio payload normalization (base64/Buffer/ArrayBuffer) |
| sudo access command-runner protocol | `agent_sudo_access_handler.cjs` | `AgentSudoAccessHandler.test.cjs` | Linux-only guard, pkexec/sudo command execution paths, cancel/auth-failure normalization, and non-interactive disable semantics |
| permission probe/request protocol | `permission_service.cjs` | `PermissionService.test.cjs` | manifest/status shape, per-permission probe behavior, unknown-permission error surface, and request flow normalization |
| wakeword STT trigger channel consumption | renderer chatbox overlay listeners | `ChatBoxOverlayMouseIgnore.test.jsx` | renderer listener wiring for `wakeword-stt-trigger` channel and overlay-focused behavior consistency |
| websocket open + overlay phase lifecycle | `connect()` open/message handlers (`ipc.cjs`) | `IpcMainBridge.lifecycle.test.cjs` | handshake user-id sanitization, backend endpoint metadata exposure, backend tool-event to response-overlay phase transitions, and active display-affinity continuity across websocket close |
| main-window open target channel routing | dashboard IPC event listener + panel routing | `ChatGptDashboardShell.test.jsx` | `main-window-open-target` payload routes to chat/settings/models/memory surfaces with chat target panel-close behavior |

## Protocol Control-Path Test Index

| Control path | Main runtime owner | Primary test anchors |
|---|---|---|
| connection snapshot + handshake bootstrap (`get-client-user-id`, `ipc-status`) | `frontend/src/main/ipc.cjs` | `IpcMainBridge.lifecycle.test.cjs`, `AppConfigProvider.storageAndIpc.test.tsx` |
| query send + settings ACK gate + synthetic local echo | `frontend/src/main/ipc.cjs` | `IpcMainBridge.query.test.cjs` |
| overlay pre-capture + response-overlay phase transitions | `frontend/src/main/ipc.cjs`, `frontend/src/main/response_overlay_phase_handler.cjs` | `IpcMainBridge.query.test.cjs`, `IpcMainBridge.lifecycle.test.cjs`, `OverlayPhaseListener.test.js` |
| overlay IPC runtime channel ownership | `frontend/src/main/overlay_phase_ipc_runtime.cjs` | `OverlayPhaseIpcRuntime.test.cjs` |
| window-control IPC runtime target routing + visibility handlers | `frontend/src/main/window_controls_ipc_runtime.cjs` | `WindowControlsIpcRuntime.test.cjs` |
| display query payload mapping | `frontend/src/main/display_query_handler.cjs` | `DisplayQueryHandler.test.cjs` |
| permission/sudo IPC runtime channel ownership | `frontend/src/main/permission_ipc_runtime.cjs` | `PermissionIpcRuntime.test.cjs` |
| wakeword detect -> STT trigger channel | `frontend/src/main/main_window_runtime.cjs`, `frontend/src/main/overlay_signal_runtime.cjs`, `frontend/src/main/wakeword_bridge.cjs`, `frontend/src/main/wakeword_bridge_runtime.cjs` | `WakewordBridge.test.cjs`, `WakewordBridgeRuntime.test.cjs`, `ChatBoxOverlayMouseIgnore.test.jsx` |
| show-main-window target normalization -> dashboard surface routing | `frontend/src/main/window_controls_ipc_runtime.cjs`, `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx` | `ChatGptDashboardShell.test.jsx` |
| local sidecar RPC mapping + sudo mode propagation | `frontend/src/main/local_backend_bridge.cjs` | `LocalBackendBridge.rpc.test.cjs`, `LocalBackendBridge.lifecycle.test.cjs` |

## Renderer IPC Validation Contract

`tests/frontend/IpcBridgeValidation.test.ts` defines environment-aware guard behavior:

- development mode:
  - `send` invalid channel throws `Invalid send channel`
  - `invoke` invalid channel rejects `Invalid invoke channel`
  - `on`/`once` invalid channels throw `Invalid on channel`
- production mode:
  - no validation exception
  - calls pass through to `window.ipc.send`/`window.ipc.invoke`

This reflects current intent: runtime safety in preload, fast-fail ergonomics in development.

## Main Query Transport and Context Contract

`tests/frontend/IpcMainBridge.query.test.cjs` verifies the query branch in `ipc.cjs`:

- overlay pre-capture callback executes only for renderer URLs with `?view=chatbox`
- query send when disconnected emits synthetic `from-backend` error with preserved turn context
- outbound query payload keeps explicit or resolved `conversation_ref`
- local echo event (`local-user-message`) uses same resolved conversation ref as outbound message
- query body includes system context + memory sections + user query block
- XML-sensitive strings in query/system/memory fields are escaped
- `screenshot_url` stripped before backend send
- system-state and memory failures degrade to deterministic fallback context blocks
- initial settings sync and pending update-settings ACK both gate query send
- transient query send failure does not poison initial-context lookup behavior for subsequent query
- reconnect resets stale backend conversation fallback before next query

## Query Payload Builder Contract

`tests/frontend/QueryPayloadBuilder.test.cjs` locks details in `buildQueryPayloadContent(...)`:

- query context requests `active_window`, `mouse_position`, and `screen_resolution`
- `windows` is only requested by explicit callers that opt into the broader system-state capture
- memory search receives `(text, userId, 5, null, conversationRef)` call contract
- output content always includes:
  - `<system_context> ... </system_context>`
  - `<episodic_memory> ... </episodic_memory>`
  - `<semantic_memory> ... </semantic_memory>`
  - `<user_query> ... </user_query>`
- `runtimeSystemState` currently carries only `screen_resolution` when present
- system state retrieval failures or null payloads fall back to `Unknown` active-window context
- memory search failures fall back to `None` memory sections

## Local Backend Bridge Lifecycle and RPC Mapping Contract

`tests/frontend/LocalBackendBridge.lifecycle.test.cjs` enforces process-generation safety:

- sidecar exit/error rejects pending execute-tool requests with standardized unavailable errors
- non-zero exit broadcasts `local-backend-status` with `{ready:false,error:<message>}`
- stale readiness timeout/retry callbacks from previous process generation are ignored
- delayed force-kill timer from `stopLocalBackend` cannot kill a newly restarted process

`tests/frontend/LocalBackendBridge.rpc.test.cjs` enforces IPC-to-JSON-RPC mapping:

- `execute-tool` success/error response normalization
- resolved backend HTTP URL export in child-process env (`WINDIE_BACKEND_HTTP_URL`)
- `NODE_OPTIONS` augmentation with `--no-deprecation`
- suppression of known noisy deprecation stderr lines while preserving meaningful logs
- key mapping coverage for:
  - `search-memory` (camelCase + snake_case `exclude_conversation_id`)
  - `list-conversations`
  - `list-semantic-memories`
  - `get-conversation`
  - `delete-conversation`
  - `delete-episodic-memory`
  - `delete-semantic-memory`
  - `store-transcript`
  - `store-memory`
- malformed/non-object IPC payloads normalize to safe empty param objects for mapped handlers
- `execute-tool` direct `run_shell_command` and nested `system_use -> run_shell_command` payloads inject `sudo_auth_mode` based on `agent_full_sudo_enabled` frontend config

## Wakeword Bridge Protocol Contract

`tests/frontend/WakewordBridge.test.cjs` validates framed-detection and restart behavior:

- detection frame triggers both callback and `wakeword-detected` event payload forwarding
- disabled mode ignores detections
- restart after process exit keeps callback and detection forwarding behavior
- stale partial stdout frame state is cleared across restart
- stale process exit events after restart are ignored (generation safety)
- stale partial stderr JSON buffer is cleared across beforeExit/enable restart path

`tests/frontend/WakewordBridgeRuntime.test.cjs` validates helper-level contracts:

- packaged/dev startup error text mapping
- ENOENT process-error guidance by launch-target kind
- stderr `{"status":"ready"}` -> `wakeword-status { ready:true }` promotion
- audio payload normalization across supported types and invalid payload rejection

## Permission/Sudo Protocol Contract

`tests/frontend/AgentSudoAccessHandler.test.cjs` validates:

- Linux-only support guard behavior.
- Enable flow writes/validates sudoers via `pkexec`.
- Disable flow uses `sudo -n` and returns explicit remediation guidance when non-interactive disable fails.
- Spawn errors and auth-cancel conditions map to normalized renderer-safe result payloads.

`tests/frontend/PermissionService.test.cjs` validates:

- Permission manifest snapshot surface (`manifest_version`, `permissions[]`, `statuses[]`).
- Probe behavior for known permission IDs and unknown-ID error handling.
- Permission request flow returns normalized status payload.

`tests/frontend/PermissionIpcRuntime.test.cjs` validates:

- Permission + sudo channels are registered by `permission_ipc_runtime.cjs` rather than overlay/window registrars.
- `check-permission` and `run-permission-probe` return the same canonical status envelope shape.

## Split Registrar Runtime Contracts

`tests/frontend/OverlayPhaseIpcRuntime.test.cjs` validates:

- Overlay runtime registers only phase-owned overlay channels.
- Deprecated channels (`set-overlay-ignore-mouse`, `set-overlay-focusable`, `prepare-overlay-tool-focus`) remain unregistered.
- `set-chatbox-visual-anchor-height` updates propagate to response/context-label positioning sync.

`tests/frontend/WindowControlsIpcRuntime.test.cjs` validates:

- `show-main-window` routing + open-target emission is owned by `window_controls_ipc_runtime.cjs`.
- Main-window visibility and window-control invoke handlers are registered in the same module boundary.

`tests/frontend/DisplayQueryHandler.test.cjs` validates:

- Display list responses use stable ordinal labels (`Display N (WxH)`).
- Primary display mapping and empty-list behavior are deterministic.

## Residual Risk and Suggested Additions

Useful expansions if protocol surface changes:

- direct assertion for `SETTINGS_SYNC_TIMEOUT_MS` timeout fallback path in `ipc.cjs`
- explicit tests for `normalizeBackendPayload('tool-bundle-result')` screenshot stripping parity
- explicit tests for wakeword error payload mapping on spawn `ENOENT` and non-zero exit codes in this suite

## Recompute Protocol Test Surface Commands

Use this command to inspect protocol-test breadth:

- `python - <<'PY'`
- `import pathlib`
- `paths=[`
- `  'tests/frontend/IpcBridgeValidation.test.ts',`
- `  'tests/frontend/IpcMainBridge.query.test.cjs',`
- `  'tests/frontend/IpcMainBridge.lifecycle.test.cjs',`
- `  'tests/frontend/QueryPayloadBuilder.test.cjs',`
- `  'tests/frontend/LocalBackendBridge.lifecycle.test.cjs',`
- `  'tests/frontend/LocalBackendBridge.rpc.test.cjs',`
- `  'tests/frontend/WakewordBridge.test.cjs',`
- `  'tests/frontend/WakewordBridgeRuntime.test.cjs',`
- `  'tests/frontend/AgentSudoAccessHandler.test.cjs',`
- `  'tests/frontend/PermissionService.test.cjs',`
- `  'tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx',`
- `  'tests/frontend/ChatGptDashboardShell.test.jsx',`
- `  'tests/frontend/OverlayPhaseIpcRuntime.test.cjs',`
- `  'tests/frontend/WindowControlsIpcRuntime.test.cjs',`
- `  'tests/frontend/PermissionIpcRuntime.test.cjs',`
- `  'tests/frontend/DisplayQueryHandler.test.cjs',`
- `]`
- `for p in paths:`
- `    import re`
- `    text=pathlib.Path(p).read_text()`
- `    count=len(re.findall(r'\\b(?:test|it)\\s*\\(', text))`
- `    print(p, 'tests=', count)`
- `PY`

## Related Pages

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
