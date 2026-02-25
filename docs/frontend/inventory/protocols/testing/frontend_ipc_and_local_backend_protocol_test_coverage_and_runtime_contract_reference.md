---
summary: "Deep frontend protocol test reference mapping renderer IPC validation, main-query transport behavior, enriched query payload construction, local-backend bridge lifecycle/RPC mappings, and wakeword subprocess restart safety to concrete tests."
read_when:
  - When changing `frontend/src/main/ipc.cjs` query send behavior, settings-ack gating, or outbound payload normalization.
  - When changing renderer IPC channel guards, local-backend JSON-RPC parameter mapping, or wakeword process/buffer lifecycle handling.
title: "Frontend IPC and Local-Backend Protocol Test Coverage and Runtime Contract Reference"
---

# Frontend IPC and Local-Backend Protocol Test Coverage and Runtime Contract Reference

## Scope and Sources

Primary runtime modules:

- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`

Primary protocol tests:

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/QueryPayloadBuilder.test.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`

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
| wakeword stream/restart robustness | wakeword subprocess + framed parser (`wakeword_bridge.cjs`) | `WakewordBridge.test.cjs` | detection callback + renderer event fire only when enabled; process restarts keep callback wiring; stale stdout/stderr partial buffers are cleared across restarts |

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

- initial context requests full field set (`active_window`, `mouse_position`, `screen_resolution`, `windows`)
- sequential context requests reduced field set (no `windows`)
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
  - `delete-semantic-memory`
  - `store-transcript`
  - `store-memory`
- malformed/non-object IPC payloads normalize to safe empty param objects for mapped handlers

## Wakeword Bridge Protocol Contract

`tests/frontend/WakewordBridge.test.cjs` validates framed-detection and restart behavior:

- detection frame triggers both callback and `wakeword-detected` event payload forwarding
- disabled mode ignores detections
- restart after process exit keeps callback and detection forwarding behavior
- stale partial stdout frame state is cleared across restart
- stale process exit events after restart are ignored (generation safety)
- stale partial stderr JSON buffer is cleared across beforeExit/enable restart path

## Residual Risk and Suggested Additions

Useful expansions if protocol surface changes:

- direct assertion for `SETTINGS_SYNC_TIMEOUT_MS` timeout fallback path in `ipc.cjs`
- explicit tests for `normalizeBackendPayload('tool-bundle-result')` screenshot stripping parity
- explicit tests for wakeword error payload mapping on spawn `ENOENT` and non-zero exit codes in this suite

## Related Pages

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
