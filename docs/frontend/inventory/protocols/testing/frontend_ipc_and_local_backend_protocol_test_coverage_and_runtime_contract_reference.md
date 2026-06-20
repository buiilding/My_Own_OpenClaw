---
summary: "Deep frontend protocol test reference mapping renderer IPC validation, websocket/query lifecycle behavior, split main-process IPC registrar ownership, local-runtime bridge contracts, and wakeword restart safety to concrete tests."
read_when:
  - When changing `frontend/src/main/ipc.cjs` query send behavior, settings-ack gating, or outbound payload normalization.
  - When changing renderer IPC channel guards, split main-process IPC registrars, local-runtime JSON-RPC parameter mapping, or wakeword process/buffer lifecycle handling.
title: "Frontend IPC and Local Runtime Protocol Test Coverage and Runtime Contract Reference"
---

# Frontend IPC and Local Runtime Protocol Test Coverage and Runtime Contract Reference

## Coverage Snapshot (2026-03-07)

- Protocol test files in this reference: `16`
- Total test cases across listed files: `175`

## Scope and Sources

Primary runtime modules:

- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/display_query_handler.cjs`

Primary protocol tests:

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`
- `tests/frontend/AgentSdkContextEnrichment.test.ts`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`
- `tests/frontend/PermissionService.test.cjs`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/DashboardShell.test.jsx`
- `tests/frontend/OverlayPhaseIpcRuntime.test.cjs`
- `tests/frontend/WindowControlsIpcRuntime.test.cjs`
- `tests/frontend/PermissionIpcRuntime.test.cjs`
- `tests/frontend/DisplayQueryHandler.test.cjs`

## Contract Coverage Matrix

| Contract Area | Runtime Owner | Key Tests | Verified Guarantees |
|---|---|---|---|
| renderer-side channel guard policy | `IpcBridge` (`bridge.ts`) | `IpcBridgeValidation.test.ts` | invalid channels throw in development; production skips guard checks and passes through to preload API |
| query-send orchestration + fallback eventing | `windie:invoke` command `conversation.send` + helpers (`ipc.cjs`) | `IpcMainBridge.query.test.cjs` | overlay pre-capture hook runs only for chatbox-origin sends; disconnected send synthesizes renderer-visible `error` event |
| settings ACK gate before query | settings sync logic (`ipc.cjs`) | settings-gate tests in `IpcMainBridge.query.test.cjs` | first query waits for initial `update-settings` ACK when cached config exists; pending renderer settings ACK blocks query send |
| outbound payload normalization | SDK `filterBackendPayload(...)` imported by Electron main direct payload senders | backend websocket contract tests and screenshot-strip tests | known command payloads are filtered to backend contract keys from the SDK-owned allowlist; client-supplied `screenshot_url` is removed from outbound payloads while keeping supported screenshot refs |
| query-context enrichment + escaping | SDK `ContextEnrichmentPipeline.ts` | `AgentSdkContextEnrichment.test.ts` + query relay tests | memories, attachment context, and user query render into XML-like content; XML-sensitive values are escaped; disabled or unavailable memory retrieval has explicit fallback behavior |
| conversation-ref fallback lifecycle | `currentConversationRef` handling (`ipc.cjs`) | conversation-ref tests in `IpcMainBridge.query.test.cjs` | backend-streamed `conversation_ref` backfills local echo + outbound query; reconnect clears stale fallback before next turn |
| SDK local-runtime readiness safety | runtime state/reset + readiness status (`local_runtime_bridge.cjs`) | `LocalRuntimeBridge.lifecycle.test.cjs` | local-runtime provider failures resolve with standardized errors; stale status snapshots do not clobber current runtime state |
| local runtime RPC shape mapping | handler registration + mapper utilities (`local_runtime_bridge.cjs`) | `LocalRuntimeBridge.rpc.test.cjs` | IPC payload keys map to backend snake_case params; non-object payloads normalize safely; error responses use canonical `{success:false,error}` shape |
| overlay IPC registrar ownership boundary | `overlay_phase_ipc_runtime.cjs` | `OverlayPhaseIpcRuntime.test.cjs` | overlay phase module registers only overlay-owned channels (`set-responsebox-size`, `set-chatbox-visual-anchor-height`, `show-chatbox`, `hide-chatbox`, `move-chatbox-to`) and does not own deprecated focus/interactivity channels |
| window-control IPC registrar + display mapping | `window_controls_ipc_runtime.cjs`, `display_query_handler.cjs` | `WindowControlsIpcRuntime.test.cjs`, `DisplayQueryHandler.test.cjs` | `show-main-window` normalization/route emit stays in window-control module; display inventory payload is mapped to stable `{ id, label, isPrimary, bounds, scaleFactor }` |
| permission IPC registrar ownership | `permission_ipc_runtime.cjs` | `PermissionIpcRuntime.test.cjs` | permission invoke handlers are registered in the permission runtime module and remain isolated from overlay/window channels |
| wakeword stream/restart robustness | wakeword subprocess + framed parser (`wakeword_bridge.cjs`) | `WakewordBridge.test.cjs` | detection callback + renderer event fire only when enabled; process restarts keep callback wiring; stale stdout/stderr partial buffers are cleared across restarts |
| wakeword helper runtime normalization | helper runtime (`wakeword_bridge_runtime.cjs`) | `WakewordBridgeRuntime.test.cjs` | packaged-vs-dev startup error mapping, ENOENT process error guidance, stderr ready-status promotion, and audio payload normalization (base64/Buffer/ArrayBuffer) |
| permission probe/request protocol | `permission_service.cjs` | `PermissionService.test.cjs` | manifest/status shape, per-permission probe behavior, unknown-permission error surface, and request flow normalization |
| wakeword STT trigger channel consumption | renderer chatbox overlay listeners | `ChatBoxOverlayMouseIgnore.test.jsx` | renderer listener wiring for `wakeword-stt-trigger` channel and overlay-focused behavior consistency |
| websocket open + overlay phase lifecycle | `connect()` open/message handlers (`ipc.cjs`) | `IpcMainBridge.lifecycle.test.cjs` | handshake user-id sanitization, backend endpoint metadata exposure, backend tool-event to response-overlay phase transitions, and active display-affinity continuity across websocket close |
| main-window open target channel routing | dashboard IPC event listener + panel routing | `DashboardShell.test.jsx` | `main-window-open-target` payload routes to chat/settings/models/memory surfaces with chat target panel-close behavior |

## Protocol Control-Path Test Index

| Control path | Main runtime owner | Primary test anchors |
|---|---|---|
| connection snapshot + handshake bootstrap (`get-client-user-id`, `ipc-status`) | `frontend/src/main/ipc.cjs` | `IpcMainBridge.lifecycle.test.cjs`, `AppConfigProvider.storageAndIpc.test.tsx` |
| query send + settings ACK gate + synthetic local echo | `frontend/src/main/ipc.cjs` | `IpcMainBridge.query.test.cjs` |
| overlay pre-capture + response-overlay phase transitions | `frontend/src/main/ipc.cjs`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs` | `IpcMainBridge.query.test.cjs`, `IpcMainBridge.lifecycle.test.cjs`, `ResponseOverlayPhaseHandler.test.cjs` |
| overlay IPC runtime channel ownership | `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs` | `OverlayPhaseIpcRuntime.test.cjs` |
| window-control IPC runtime target routing + visibility handlers | `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs` | `WindowControlsIpcRuntime.test.cjs` |
| display query payload mapping | `frontend/src/main/surfaces/display_query_handler.cjs` | `DisplayQueryHandler.test.cjs` |
| permission IPC runtime channel ownership | `frontend/src/main/permissions/permission_ipc_runtime.cjs` | `PermissionIpcRuntime.test.cjs` |
| wakeword detect -> STT trigger channel | `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/surfaces/overlay_signal_runtime.cjs`, `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs` | `WakewordBridge.test.cjs`, `WakewordBridgeRuntime.test.cjs`, `ChatBoxOverlayMouseIgnore.test.jsx` |
| show-main-window target normalization -> dashboard surface routing | `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx` | `DashboardShell.test.jsx` |
| local runtime RPC mapping | `frontend/src/main/sidecar/local_runtime_bridge.cjs` | `LocalRuntimeBridge.rpc.test.cjs`, `LocalRuntimeBridge.lifecycle.test.cjs` |

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

- overlay pre-capture callback executes only for renderer URLs with `?view=minimal-chat-pill`
- query send when disconnected emits SDK/runtime failure projections with preserved turn context
- outbound query payload keeps explicit or resolved `conversation_ref`
- SDK local `user_message` projection uses the same resolved conversation ref as outbound message
- query body includes memory sections + user query block
- XML-sensitive strings in query/memory fields are escaped
- backend command payloads filtered to contract-backed allowlists before send
- `screenshot_url` stripped before backend send
- memory failures degrade to deterministic fallback content
- initial settings sync and pending update-settings ACK both gate query send
- transient query send failure does not poison initial-context lookup behavior for subsequent query
- reconnect resets stale backend conversation fallback before next query

## Query Payload and Enrichment Contract

`tests/frontend/IpcQueryRuntime.test.cjs` locks main-process query payload normalization:

- renderer payload fields are filtered to the backend query contract
- conversation refs and authenticated user ids are required before send

`tests/frontend/AgentSdkContextEnrichment.test.ts` locks SDK model-facing content rendering:
- memory search uses backend embeddings and sidecar `search_memory_by_embedding` before backend query send
- output content always includes:
  - `<episodic_memory> ... </episodic_memory>`
  - `<semantic_memory> ... </semantic_memory>`
  - `<user_query> ... </user_query>`
- optional attachment context renders as `<attached_file_context> ... </attached_file_context>`
- memory search failures fall back to `None` memory sections

## Local Runtime Bridge Lifecycle and Scoped RPC Contract

`tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs` enforces process-generation safety:

- sidecar exit/error rejects pending internal tool execution requests with standardized unavailable errors
- non-zero exit broadcasts `local-runtime-status` with `{ready:false,error:<message>}`
- stale readiness timeout/retry callbacks from previous process generation are ignored
- delayed force-kill timer from `stopLocalRuntime` cannot kill a newly restarted process

`tests/frontend/LocalRuntimeBridge.rpc.test.cjs` enforces scoped host
IPC-to-JSON-RPC behavior:

- internal tool execution success/error response normalization
- scoped host channel mapping for attachment reads, browser controls,
  screenshots, and system state
- removed mapped chat/memory IPC channels are not registered

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

`tests/frontend/PermissionService.test.cjs` validates:

- Permission manifest snapshot surface (`manifest_version`, `permissions[]`, `statuses[]`).
- Probe behavior for known permission IDs and unknown-ID error handling.
- Permission request flow returns normalized status payload.

`tests/frontend/PermissionIpcRuntime.test.cjs` validates:

- Permission channels are registered by `permission_ipc_runtime.cjs` rather than overlay/window registrars.
- `check-permission` and `run-permission-probe` return the same canonical status envelope shape.

## Split Registrar Runtime Contracts

`tests/frontend/OverlayPhaseIpcRuntime.test.cjs` validates:

- Overlay runtime registers only phase-owned overlay channels.
- Deprecated channels (`set-overlay-ignore-mouse`, `set-overlay-focusable`, `prepare-overlay-tool-focus`) remain unregistered.
- `set-chatbox-visual-anchor-height` updates propagate to response positioning sync.

`tests/frontend/WindowControlsIpcRuntime.test.cjs` validates:

- `show-main-window` routing + open-target emission is owned by `window_controls_ipc_runtime.cjs`.
- Main-window visibility and window-control invoke handlers are registered in the same module boundary.

`tests/frontend/DisplayQueryHandler.test.cjs` validates:

- Display list responses use stable ordinal labels (`Display N (WxH)`).
- Primary display mapping and empty-list behavior are deterministic.

## Residual Risk and Suggested Additions

Useful expansions if protocol surface changes:

- direct assertion for `SETTINGS_SYNC_TIMEOUT_MS` timeout fallback path in `ipc.cjs`
- explicit tests for new backend command types through the SDK-owned
  `filterBackendPayload(...)` parity coverage
- explicit tests for wakeword error payload mapping on spawn `ENOENT` and non-zero exit codes in this suite

## Recompute Protocol Test Surface Commands

Use this command to inspect protocol-test breadth:

- `python - <<'PY'`
- `import pathlib`
- `paths=[`
- `  'tests/frontend/IpcBridgeValidation.test.ts',`
- `  'tests/frontend/IpcMainBridge.query.test.cjs',`
- `  'tests/frontend/IpcMainBridge.lifecycle.test.cjs',`
- `  'tests/frontend/IpcQueryRuntime.test.cjs',`
- `  'tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs',`
- `  'tests/frontend/LocalRuntimeBridge.rpc.test.cjs',`
- `  'tests/frontend/WakewordBridge.test.cjs',`
- `  'tests/frontend/WakewordBridgeRuntime.test.cjs',`
- `  'tests/frontend/PermissionService.test.cjs',`
- `  'tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx',`
- `  'tests/frontend/DashboardShell.test.jsx',`
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
