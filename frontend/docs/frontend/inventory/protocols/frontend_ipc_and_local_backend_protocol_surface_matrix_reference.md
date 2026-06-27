---
summary: "Canonical frontend protocol matrix: preload allowlisted channels, main-process IPC handler ownership, and SDK local-runtime JSON-RPC methods with timeout/readiness behavior."
read_when:
  - When adding/changing renderer `window.ipc` channels.
  - When updating main-process local-runtime bridge helpers, SDK local-runtime methods, parameter mapping, or timeout policies.
title: "Frontend IPC and Local Runtime Protocol Surface Matrix Reference"
---

# Frontend IPC and Local-Runtime Protocol Surface Matrix Reference

## Renderer Invoke Channel Counts and Local-Runtime Mapper Snapshot (2026-06-17)

- Renderer `send` channels: `8`
- Renderer `invoke` channels: `41`
- Renderer `on/once` channels: `23`
- Compiled JSON-RPC mapper definitions: `0` (direct chat/memory IPC mapper removed)

## Scope and Sources

This page maps protocol surfaces across renderer, Electron main, and the
local-runtime Python implementation:

- Shared preload/main channel registry: `frontend/src/shared/ipcChannels.json`
- Preload allowlist boundary: `frontend/src/preload.js`
- Renderer channel constants + typed bridge: `frontend/src/renderer/infrastructure/ipc/channels.ts`, `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- Main SDK/websocket bridge and IPC handlers: `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs`, `frontend/src/main/ipc/ipc_artifact_handlers.cjs`, `frontend/src/main/ipc/ipc_clipboard_image.cjs`, `frontend/src/main/ipc/ipc_image_context_menu.cjs`, `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- Wakeword IPC bridge: `frontend/src/main/wakeword/wakeword_bridge.cjs` + `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- Main local-runtime scoped host bridge: `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- Python JSON-RPC method registry and protocol parser: `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/core/ipc_protocol.py`

## Renderer `window.ipc` Contract

Preload exports `window.ipc.{send, invoke, on, once}` and hard-allowlists channel names. Invalid `invoke` channels reject with an error.

### `send` Channels (Renderer -> Main, fire-and-forget)

| Channel | Main owner | Primary behavior |
|---|---|---|
| `renderer-log` | `main/ipc/ipc_renderer_diagnostics_handlers.cjs` | Receives renderer log envelopes and forwards them into the Electron main logging path |
| `live-surface-trace` | `main/ipc/ipc_renderer_diagnostics_handlers.cjs` | Receives renderer live-surface trace envelopes for deterministic surface diagnostics |
| `windie:pending-turn` | `main/ipc/ipc_pending_turn_handlers.cjs` | Stores, broadcasts, replays, and clears renderer-composed pending user turns until SDK current-turn projection catches up |
| `transcript-session-sync` | `main/ipc/ipc_client_session_handlers.cjs` | Syncs renderer transcript session/conversation/user identity into Electron main session state and rebroadcasts normalized session snapshots |
| `move-chatbox-to` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Repositions chatbox overlay window |
| `wakeword-audio-chunk` | `main/wakeword_bridge.cjs` (`wakeword_bridge_runtime.cjs` normalizes payload types) | Streams mic PCM chunks to wakeword subprocess |
| `wakeword-enable` | `main/wakeword_bridge.cjs` (`wakeword_bridge_runtime.cjs` maps startup/status errors) | Enables wakeword detection / starts service if needed |
| `wakeword-disable` | `main/wakeword_bridge.cjs` | Disables wakeword detection and flushes buffers |

### `invoke` Channels (Renderer -> Main, request/response)

| Channel | Main owner | Notes |
|---|---|---|
| `windie:invoke` | `main/ipc/ipc_agent_sdk_command_handlers.cjs` registered from `main/ipc.cjs` | Single SDK command router for renderer `window.agentSdk.invoke(command, payload)`; handles query/stop and SDK-shaped local runtime commands instead of exposing memory/conversation implementation RPC names directly through preload |
| `capture-screenshot-attachment` | `main local-runtime bridge` | Maps renderer screenshot attachment capture to local `screenshot` execution |
| `read-attachment-file` | `main local-runtime bridge` | Maps readable attachment context reads to local `read_file` execution |
| `run-browser-action` | `main local-runtime bridge` | Maps browser session controls to local `browser` execution |
| `upload-artifact` | `main/ipc.cjs` | Uploads base64 artifact to backend HTTP `/api/artifacts/` |
| `fetch-artifact-image` | `main/ipc/ipc_artifact_handlers.cjs` | Fetches a backend artifact image through the authenticated artifact handler |
| `get-system-state` | `main local-runtime bridge` | Proxies to local-runtime `get_system_state` |
| `get-client-user-id` | `main/ipc/ipc_client_session_handlers.cjs` | Returns connection/user/session/conversation snapshot |
| `copy-image-to-clipboard` | `main/ipc/ipc_image_interaction_handlers.cjs` | Copies a trusted image URL/data payload into the OS clipboard through the clipboard image runtime |
| `show-image-context-menu` | `main/ipc/ipc_image_interaction_handlers.cjs` | Opens the trusted image context menu and clipboard actions through the context-menu runtime |
| `set-chatbox-visual-anchor-height` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Updates chatbox visual anchor height for overlay positioning |
| `set-chatbox-hit-test-active` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Toggles chatbox overlay hit testing |
| `set-responsebox-hit-test-active` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Toggles response overlay hit testing |
| `set-responsebox-size` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Resize response overlay |
| `show-main-window` | `main/surfaces/window_controls_ipc_runtime.cjs` | Show dashboard window; optional `{ open, maximize }`; `open` target must normalize to `chat|memory|models|settings` before emit; `maximize` is platform-aware (`maximize` on Windows/Linux, native fullscreen on macOS when not display-targeted) |
| `get-main-window-visibility` | `main/surfaces/window_controls_ipc_runtime.cjs` | Returns dashboard visibility state |
| `show-chatbox` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Show chatbox overlay |
| `activate-chatbox-text-entry` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Focuses chatbox text entry without changing the renderer command path |
| `hide-chatbox` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Hide chatbox overlay |
| `handoff-surface-for-computer-use` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Hides or makes Windie surfaces non-interfering for computer-use execution |
| `prepare-surface-for-screenshot` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Applies screenshot-safe surface state before capture |
| `restore-surface-after-screenshot` | `main/surfaces/overlay_phase_ipc_runtime.cjs` | Restores overlay state after screenshot capture |
| `get-displays` | `main/surfaces/window_controls_ipc_runtime.cjs` | Return display inventory mapped as `{ id, label, isPrimary, bounds, scaleFactor }` |
| `load-frontend-config` | `main/ipc.cjs` | Reads desktop UI config from disk |
| `save-frontend-config` | `main/ipc.cjs` | Persists desktop UI config to disk |
| `list-agent-extensions` | `main/ipc/ipc_extension_mcp_handlers.cjs`; renderer via `DesktopExtensionRuntimeClient` | Returns public extension metadata plus MCP registry snapshot |
| `list-mcp-servers` | `main/ipc/ipc_extension_mcp_handlers.cjs`; renderer via `DesktopMcpRuntimeClient` | Lists configured MCP servers from desktop UI config |
| `set-mcp-server-enabled` | `main/ipc/ipc_extension_mcp_handlers.cjs`; renderer via `DesktopMcpRuntimeClient` | Persists MCP enablement and refreshes SDK MCP registration when running outside tests |
| `refresh-mcp-servers` | `main/ipc/ipc_extension_mcp_handlers.cjs`; renderer via `DesktopMcpRuntimeClient` | Rebuilds current MCP server registry from config |
| `list-permissions` | `main/permissions/permission_ipc_runtime.cjs` | Returns permission manifest + status bundle |
| `check-permissions` | `main/permissions/permission_ipc_runtime.cjs` | Batch permission probe result list |
| `check-permission` | `main/permissions/permission_ipc_runtime.cjs` | Single permission probe shortcut |
| `run-permission-probe` | `main/permissions/permission_ipc_runtime.cjs` | Explicit probe execution for one permission |
| `request-permission` | `main/permissions/permission_ipc_runtime.cjs` | OS request/open-settings path per permission |
| `set-active-workspace` | `main/permissions/permission_ipc_runtime.cjs` | Updates active workspace permission context |
| `window-minimize` | `main/surfaces/window_controls_ipc_runtime.cjs` | Minimize main window |
| `window-toggle-maximize` | `main/surfaces/window_controls_ipc_runtime.cjs` | Toggle maximize state; macOS uses native fullscreen instead of Electron maximize |
| `window-close` | `main/surfaces/window_controls_ipc_runtime.cjs` | Close main window |
| `get-local-runtime-status` | `main local-runtime bridge` | Wakes/reads SDK local-runtime status for renderer status surfaces |

### `on`/`once` Channels (Main -> Renderer)

| Channel | Main emitter | Payload purpose |
|---|---|---|
| `windie:rows` | `main/ipc.cjs` | SDK conversation runtime display-row projection snapshots |
| `windie:status` | `main/ipc.cjs` | SDK query/connection/terminal status projections |
| `windie:conversation-event` | `main/ipc.cjs` | Raw SDK conversation runtime event stream for renderer stores |
| `windie:memory-store-changed` | `main/ipc.cjs` | SDK memory-store invalidation event emitted from conversation runtime events |
| `windie:conversation-metadata-invalidated` | `main/ipc.cjs` | Conversation metadata invalidation signal for sidebar/list refreshes |
| `windie:current-turn` | `main/ipc.cjs` | Current live-turn projection for overlay/runtime presentation |
| `windie:pending-turn` | `main/ipc/ipc_pending_turn_handlers.cjs` | Pending renderer user turn replay/clear events for secondary windows and startup handoff |
| `transcript-session-sync` | `main/ipc/ipc_transcript_session_sync.cjs` | Normalized transcript session/conversation/user identity snapshot |
| `ipc-status` | `main/ipc.cjs` | Backend connection + client/user/session snapshot |
| `local-runtime-status` | `main local-runtime bridge` | Local-runtime daemon process/readiness status |
| `log` | Reserved in preload/typed constants | Main-to-renderer log channel retained in allowlist for renderer listeners |
| `wakeword-detected` | `main/wakeword_bridge.cjs` | Wakeword detection event (`model`, `confidence`, `score`) |
| `wakeword-status` | `main/wakeword_bridge.cjs` (`wakeword_bridge_runtime.cjs` emits normalized status payloads) | Wakeword subprocess readiness/error |
| `wakeword-toggle` | `main/index.cjs` | UI wakeword enabled/disabled signal |
| `wakeword-stt-trigger` | `main/index.cjs` | Tells renderer to start post-wakeword STT capture flow |
| `chatbox-focus` | `main/index.cjs` | Request focus behavior in chatbox view |
| `workspace-access-updated` | `main/index.cjs` | Workspace permission/access state update |
| `main-window-open-target` | `main/index.cjs` | Dashboard route target (`chat`, `memory`, `models`, `settings`) |
| `response-overlay-phase` | `main/ipc.cjs` | Stream/loop phase state (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`) |
| `backend-settings-event` | `main/ipc/ipc_backend_event_channels.cjs` | Typed backend settings/model events (`models-listed`, `settings-updated`, `error`) |
| `agent-capability-event` | `main/ipc/ipc_backend_event_channels.cjs`; renderer via `DesktopExtensionRuntimeClient` | Typed backend capability events (`client-tool-manifest`, `remote-tool-catalog`) |
| `audio-chunk` | `main/ipc/ipc_backend_event_channels.cjs` | Typed backend audio chunk event fan-out |
| `response-overlay-visibility` | `main/index.cjs` | Response overlay visible state |

Notes:

- Renderer typed constants in `channels.ts` mirror `frontend/src/shared/ipcChannels.json`; drift here creates runtime rejection in preload.
- `from-backend` and `to-backend` are not current preload channels. Renderer code should use the SDK-shaped `window.agentSdk.invoke(...)` command router and typed projection events above.

## Control-Path Contract Index (Main -> Renderer)

| Channel | Emission gate/condition | Deep contract |
|---|---|---|
| `ipc-status` | websocket open/close + explicit client snapshot fan-out | [Frontend Protocol Session and Conversation-State Propagation Reference](state/frontend_protocol_session_and_conversation_state_propagation_reference.md) |
| `windie:rows` | SDK conversation runtime snapshot updates | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `windie:status` | backend/runtime connection and terminal query status updates | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `windie:conversation-event` | SDK conversation runtime events | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `windie:current-turn` | SDK live-turn projection updates | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `backend-settings-event` | typed backend model/settings/error events | [Frontend Protocol Session and Conversation-State Propagation Reference](state/frontend_protocol_session_and_conversation_state_propagation_reference.md) |
| `agent-capability-event` | typed backend tool/capability catalog events | [Frontend Protocol Session and Conversation-State Propagation Reference](state/frontend_protocol_session_and_conversation_state_propagation_reference.md) |
| `wakeword-stt-trigger` | wakeword callback only after `showChatWindow({focus:true})` success | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `main-window-open-target` | `show-main-window` invoke succeeds and target normalizes to allowed set | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `response-overlay-phase` | websocket/query/control events trigger phase transitions in `ipc.cjs` | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |
| `response-overlay-visibility` | main-process visibility state toggled via overlay phase/window close handlers | [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](lifecycle/frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md) |

## Main -> Backend WebSocket Envelope Rules

Renderer code does not send raw websocket envelopes through a `to-backend`
preload channel. Query and stop requests enter main through `windie:invoke`,
then `ipc.cjs` and the SDK runtime build and send backend messages. The backend
transport wraps outbound messages as:

```json
{
  "id": "<uuid>",
  "type": "<message-type>",
  "payload": { ... },
  "user_id": "<client-user-id>",
  "timestamp": "<ISO-8601>"
}
```

Protocol behaviors:

- Handshake is sent once per ws open: `{ type: "handshake", user_id }`.
- known backend command payloads are filtered to contract-backed allowlists
  before send; `query` and `tool-bundle-result` also strip `screenshot_url`.
- First query path gates on `update-settings` ACK (`settings-updated`/`error`) with timeout (`2500ms`).
- Main emits SDK projection channels such as `windie:rows`, `windie:status`,
  `windie:conversation-event`, and typed backend event channels instead of a
  generic `from-backend` preload event.
- Query-send failures become SDK/runtime status and conversation projections,
  not direct renderer websocket payloads.

## Main <-> Local Runtime JSON-RPC Contract

Transport:

- SDK local-runtime HTTP `POST /rpc` sends JSON-RPC 2.0 envelopes to the
  local-runtime daemon, which dispatches them in-process through `LocalRuntimeService`.
- Request correlation is owned by the SDK local-runtime HTTP client and the
  daemon JSON-RPC `id` envelope.
- Default timeout `60000ms`; local browser tool execution uses `120000ms`.

### SDK Local-Runtime JSON-RPC Method Map

Electron main no longer registers direct chat/memory bridge handler channels for
these methods. Renderer feature code reaches conversation and memory operations
through SDK-shaped commands on `windie:invoke`; SDK local-runtime store code
builds the Python JSON-RPC method and params behind that boundary.

| Owner path | JSON-RPC method | Param mapping notes |
|---|---|---|
| SDK local-runtime store | `list_episodic_memories` | `userId -> user_id` |
| SDK local-runtime store | `list_semantic_memories` | `userId -> user_id` |
| SDK local-runtime store | `delete_episodic_memory` | `memoryId -> memory_id` |
| SDK local-runtime store | `delete_semantic_memory` | `memoryId -> memory_id` |
| SDK local-runtime store | `clear_local_memory` | `userId -> user_id`; clears local memory records for the user scope |
| SDK local-runtime store | `clear_chat_history` | `userId -> user_id`; clears chat-history records for the user scope |
| SDK local-runtime store | `conversation.append_event` | transcript metadata (`messageType -> message_type`, etc.) |
| SDK local-runtime store | `conversation.list` | `userId -> user_id`, `recordKind -> record_kind` |
| SDK local-runtime store | `conversation.search` | `userId -> user_id` with query/limit passthrough |
| SDK local-runtime store | `conversation.load_events` | `conversationId -> conversation_id`, `recordKind -> record_kind` |
| SDK local-runtime store | `conversation.get_revision` | `conversationId -> conversation_id`, `recordKind -> record_kind` |
| SDK local-runtime store | `conversation.delete` | `conversationId -> conversation_id`, `recordKind -> record_kind` |
| SDK local-runtime store | `conversation.display.replace/load` | active display timeline checkpoint storage and loading |
| SDK local-runtime store | `conversation.model_history.replace/load` | bounded model-history checkpoint storage and loading |
| readiness probe (internal) | `ping` | Startup readiness checks |
| diagnostics (registered in sidecar) | `get_status` | Read through SDK local-runtime status helpers |

### Python JSON-RPC Method Registry (`local_backend.py`)

Registered callable surface:

- Tool/system: `execute_tool`, `get_system_state`
- Memory: `search_memory_by_embedding`, `store_memory_by_embedding`,
  `list_episodic_memories`, `list_semantic_memories`,
  `delete_episodic_memory`, `delete_semantic_memory`, `clear_local_memory`
- Conversation/history SDK methods: `conversation.append_event`,
  `conversation.list`, `conversation.search`, `conversation.load_events`,
  `conversation.get_revision`, `conversation.delete`,
  `conversation.display.replace`, `conversation.display.load`,
  `conversation.model_history.replace`, `conversation.model_history.load`,
  `clear_chat_history`,
  `update_conversation_title`, `get_conversation_title_state`
- Retired direct chat-history method names are not registered.
- Health/diagnostics/setup: `ping`, `get_status`, `install_browser_chromium`,
  `determine_macos_system_events_automation_permission`

### JSON-RPC Validation Semantics (`core/ipc_protocol.py`)

- Requires `jsonrpc: "2.0"` and string `method`.
- `params` must be an object.
- Handler signature is bound at runtime; invalid arg names/types return `INVALID_PARAMS`.
- Missing `id` is treated as notification (no response written).

## Local Runtime Readiness and Failure Semantics

`local_runtime_bridge.cjs` process lifecycle rules:

- Readiness probe: sends `ping` and retries up to 10 attempts with exponential delay (`50ms` base, capped `1000ms`) and per-attempt `500ms` response timeout.
- If max attempts are exhausted, bridge marks backend ready to avoid permanent deadlock.
- On process exit/error:
  - clears readiness state,
  - rejects all pending JSON-RPC promises,
  - broadcasts `local-runtime-status` with failure info (main side).

## Drift Guards

- Preload allowlists and renderer constants should remain in strict parity.
- IPC handler registration is split across `ipc.cjs`, `surfaces/overlay_phase_ipc_runtime.cjs`, `surfaces/window_controls_ipc_runtime.cjs`, `permissions/permission_ipc_runtime.cjs`, `sidecar/local_runtime_bridge.cjs`, and `wakeword/wakeword_bridge.cjs` (with helper split in `wakeword_bridge_runtime.cjs`); ownership drift often appears when adding channels without updating all surfaces.
- Chat/memory JSON-RPC params are centralized behind SDK local-runtime store code; direct ad-hoc renderer/main IPC mappings should be avoided.

## Recompute Surface Commands

Use these commands to refresh protocol counts:

- IPC channel counts:
  - `node - <<'NODE'`
  - `const channels = require('./frontend/src/shared/ipcChannels.json');`
  - `for (const name of ['SEND_CHANNELS', 'INVOKE_CHANNELS', 'ON_CHANNELS']) {`
  - `  console.log(name.toLowerCase(), Object.keys(channels[name]).length);`
  - `}`
  - `NODE`
- JSON-RPC mapper definition count:
  - direct compiled mapper definitions are intentionally `0`; verify
    `frontend/src/main/sidecar/local_runtime_rpc_mappers.cjs` does not exist
    and `local_runtime_bridge.cjs` does not import it.

## Related Deep Dive

- [Frontend Full Functionality Inventory Reference](../frontend_full_functionality_inventory_reference.md)
- [Frontend Functionality Capability Catalog Reference](../frontend_functionality_capability_catalog_reference.md)
- [Frontend Capability to File Matrix Reference](../frontend_capability_to_file_matrix_reference.md)
- [Frontend Protocol Lifecycle Hub](lifecycle/README.md)
- [Frontend Protocol State Hub](state/README.md)
- [Display Query Handler Display Inventory Payload Contract Reference](../../main/display_query_handler_display_inventory_payload_contract_reference.md)
- [Frontend Protocol Observability Hub](observability/README.md)
- [Frontend Protocol Errors Hub](errors/README.md)
- [Frontend Protocol Validation Hub](validation/README.md)
- [Frontend Protocol Testing Hub](testing/README.md)
