---
summary: "Canonical frontend protocol matrix: preload allowlisted channels, main-process IPC handler ownership, and local-backend JSON-RPC method mappings with timeout/readiness behavior."
read_when:
  - When adding/changing renderer `window.ipc` channels.
  - When updating main-process local-backend bridge methods, parameter mapping, or timeout policies.
title: "Frontend IPC and Local-Backend Protocol Surface Matrix Reference"
---

# Frontend IPC and Local-Backend Protocol Surface Matrix Reference

## Coverage Snapshot (2026-02-26)

- Renderer `send` channels: `5`
- Renderer `invoke` channels: `32`
- Renderer `on/once` channels: `11`
- Compiled JSON-RPC mapper definitions: `8` (`COMPILED_RPC_HANDLER_DEFINITIONS`)

## Scope and Sources

This page maps protocol surfaces across renderer, Electron main, and Python local backend:

- Preload allowlist boundary: `frontend/src/preload.js`
- Renderer channel constants + typed bridge: `frontend/src/renderer/infrastructure/ipc/channels.ts`, `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- Main WebSocket bridge and IPC handlers: `frontend/src/main/ipc.cjs`, `frontend/src/main/index.cjs`
- Wakeword IPC bridge: `frontend/src/main/wakeword_bridge.cjs`
- Main-to-sidecar JSON-RPC bridge: `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- Sidecar method registry and protocol parser: `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/core/ipc_protocol.py`

## Renderer `window.ipc` Contract

Preload exports `window.ipc.{send, invoke, on, once}` and hard-allowlists channel names. Invalid `invoke` channels reject with an error.

### `send` Channels (Renderer -> Main, fire-and-forget)

| Channel | Main owner | Primary behavior |
|---|---|---|
| `to-backend` | `main/ipc.cjs` | Sends structured websocket message to backend (`type`, `payload`, `id`, `user_id`, `timestamp`) |
| `move-chatbox-to` | `main/index.cjs` | Repositions chatbox overlay window |
| `wakeword-audio-chunk` | `main/wakeword_bridge.cjs` | Streams mic PCM chunks to wakeword subprocess |
| `wakeword-enable` | `main/wakeword_bridge.cjs` | Enables wakeword detection / starts service if needed |
| `wakeword-disable` | `main/wakeword_bridge.cjs` | Disables wakeword detection and flushes buffers |

### `invoke` Channels (Renderer -> Main, request/response)

| Channel | Main owner | Notes |
|---|---|---|
| `execute-tool` | `main/local_backend_bridge.cjs` | Proxies to JSON-RPC `execute_tool` |
| `get-system-state` | `main/local_backend_bridge.cjs` | Proxies to `get_system_state` |
| `search-memory` | `main/local_backend_bridge.cjs` | Proxies to `search_memory` |
| `search-conversations` | `main/local_backend_bridge.cjs` | Proxies to `search_conversations` |
| `list-conversations` | `main/local_backend_bridge.cjs` | Proxies to `list_conversations` |
| `list-episodic-memories` | `main/local_backend_bridge.cjs` | Proxies to `list_episodic_memories` |
| `get-conversation` | `main/local_backend_bridge.cjs` | Proxies to `get_conversation` |
| `list-semantic-memories` | `main/local_backend_bridge.cjs` | Proxies to `list_semantic_memories` |
| `delete-conversation` | `main/local_backend_bridge.cjs` | Proxies to `delete_conversation` |
| `delete-semantic-memory` | `main/local_backend_bridge.cjs` | Proxies to `delete_semantic_memory` |
| `store-memory` | `main/local_backend_bridge.cjs` | Proxies to `store_memory` |
| `store-transcript` | `main/local_backend_bridge.cjs` | Proxies to `store_transcript` |
| `upload-artifact` | `main/ipc.cjs` | Uploads base64 artifact to backend HTTP `/api/artifacts/` |
| `load-frontend-config` | `main/ipc.cjs` | Reads frontend config from disk |
| `save-frontend-config` | `main/ipc.cjs` | Persists frontend config to disk |
| `get-client-user-id` | `main/ipc.cjs` | Returns connection/user snapshot |
| `set-agent-sudo-access` | `main/index.cjs` | Linux-only sudo access toggle via privileged command runner |
| `list-permissions` | `main/index.cjs` | Returns permission manifest + status bundle |
| `check-permissions` | `main/index.cjs` | Batch permission probe result list |
| `check-permission` | `main/index.cjs` | Single permission probe shortcut |
| `run-permission-probe` | `main/index.cjs` | Explicit probe execution for one permission |
| `request-permission` | `main/index.cjs` | OS request/open-settings path per permission |
| `set-overlay-ignore-mouse` | `main/index.cjs` | Toggle overlay click-through |
| `set-chatbox-size` | `main/index.cjs` | Resize chatbox overlay |
| `set-responsebox-size` | `main/index.cjs` | Resize response overlay |
| `show-main-window` | `main/index.cjs` | Show dashboard window; optional `{ open, maximize }` payload |
| `show-chatbox` | `main/index.cjs` | Show chatbox overlay |
| `hide-chatbox` | `main/index.cjs` | Hide chatbox overlay |
| `get-displays` | `main/index.cjs` | Return display inventory |
| `window-minimize` | `main/index.cjs` | Minimize main window |
| `window-toggle-maximize` | `main/index.cjs` | Toggle maximize state |
| `window-close` | `main/index.cjs` | Close main window |

### `on`/`once` Channels (Main -> Renderer)

| Channel | Main emitter | Payload purpose |
|---|---|---|
| `from-backend` | `main/ipc.cjs` | Rebroadcasts backend websocket events + synthetic local events |
| `ipc-status` | `main/ipc.cjs` | Backend connection + client user snapshot |
| `wakeword-detected` | `main/wakeword_bridge.cjs` | Wakeword detection event (`model`, `confidence`, `score`) |
| `wakeword-status` | `main/wakeword_bridge.cjs` | Wakeword subprocess readiness/error |
| `wakeword-toggle` | `main/index.cjs` | UI wakeword enabled/disabled signal |
| `wakeword-stt-trigger` | `main/index.cjs` | Tells renderer to start post-wakeword STT capture flow |
| `chatbox-focus` | `main/index.cjs` | Request focus behavior in chatbox view |
| `main-window-open-target` | `main/index.cjs` | Dashboard route target (`chat`, `memory`, `models`, `settings`) |
| `response-overlay-phase` | `main/ipc.cjs` | Stream/loop phase state (`idle`, `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`, `complete`, `error`) |
| `response-overlay-visibility` | `main/index.cjs` | Response overlay visible state |
| `log` | Reserved in preload/typed constants | Currently no active sender in main runtime |

Notes:

- `local-backend-status` is emitted by `local_backend_bridge.cjs` but is not in preload allowlists, so renderer code using `window.ipc` cannot subscribe to it directly.
- Renderer typed constants in `channels.ts` mirror preload allowlists; drift here creates runtime rejection in preload.

## Main -> Backend WebSocket Envelope Rules

`ipc.cjs` wraps outbound backend messages as:

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
- `query` and `tool-bundle-result` payloads strip `screenshot_url` before send.
- First query path gates on `update-settings` ACK (`settings-updated`/`error`) with timeout (`2500ms`).
- Main emits synthetic `from-backend` events:
  - `local-user-message` before query send.
  - `error` message if query cannot be sent (backend unavailable).

## Main <-> Local Backend JSON-RPC Contract

Transport:

- JSON-RPC 2.0 over `stdin/stdout`, one JSON object per line.
- Request correlation by UUID `id` in `pendingRequests` map.
- Default timeout `30000ms`; `execute-tool` for `browser` uses `120000ms`.

### JSON-RPC Method Map (IPC channel -> method)

| IPC channel | JSON-RPC method | Param mapping notes |
|---|---|---|
| `execute-tool` | `execute_tool` | `{ toolName, args } -> { tool_name, args }`; screenshot tool uses Linux hide/show guard |
| `get-system-state` | `get_system_state` | Optional `{ fields }` passthrough |
| `search-memory` | `search_memory` | Maps `excludeConversationId` fallback to `exclude_conversation_id` |
| `search-conversations` | `search_conversations` | `userId -> user_id` with query/limit passthrough |
| `list-conversations` | `list_conversations` | `userId -> user_id`, `recordKind -> record_kind` |
| `list-episodic-memories` | `list_episodic_memories` | `userId -> user_id` |
| `get-conversation` | `get_conversation` | `conversationId -> conversation_id` (`null` when missing), `recordKind -> record_kind` |
| `list-semantic-memories` | `list_semantic_memories` | `userId -> user_id` |
| `delete-conversation` | `delete_conversation` | `conversationId -> conversation_id`, `recordKind -> record_kind` |
| `delete-semantic-memory` | `delete_semantic_memory` | `memoryId -> memory_id` |
| `store-memory` | `store_memory` | camelCase to snake_case for query/response/type/user/session keys |
| `store-transcript` | `store_transcript` | transcript metadata pass-through map (`messageType -> message_type`, etc.) |
| readiness probe (internal) | `ping` | Startup readiness checks |
| diagnostics (registered in sidecar) | `get_status` | Not currently wired to renderer IPC |

### Sidecar Method Registry (`local_backend.py`)

Registered callable surface:

- Tool/system: `execute_tool`, `get_system_state`
- Memory/transcript: `search_memory`, `search_conversations`, `store_memory`, `store_transcript`, `list_conversations`, `list_episodic_memories`, `get_conversation`, `list_semantic_memories`, `delete_conversation`, `delete_semantic_memory`
- Health/diagnostics: `ping`, `get_status`

### JSON-RPC Validation Semantics (`core/ipc_protocol.py`)

- Requires `jsonrpc: "2.0"` and string `method`.
- `params` must be an object.
- Handler signature is bound at runtime; invalid arg names/types return `INVALID_PARAMS`.
- Missing `id` is treated as notification (no response written).

## Local Backend Readiness and Failure Semantics

`local_backend_bridge.cjs` process lifecycle rules:

- Readiness probe: sends `ping` and retries up to 10 attempts with exponential delay (`50ms` base, capped `1000ms`) and per-attempt `500ms` response timeout.
- If max attempts are exhausted, bridge marks backend ready to avoid permanent deadlock.
- On process exit/error:
  - clears readiness state,
  - rejects all pending JSON-RPC promises,
  - broadcasts `local-backend-status` with failure info (main side).

## Drift Guards

- Preload allowlists and renderer constants should remain in strict parity.
- IPC handler registration is split across `ipc.cjs`, `index.cjs`, `local_backend_bridge.cjs`, and `wakeword_bridge.cjs`; ownership drift often appears when adding channels without updating all four surfaces.
- JSON-RPC channel maps are centralized in `local_backend_bridge_rpc_mappers.cjs`; direct ad-hoc mapping in other files should be avoided.

## Recompute Surface Commands

Use these commands to refresh protocol counts:

- IPC channel counts:
  - `python - <<'PY'`
  - `import re, pathlib`
  - `text=pathlib.Path('frontend/src/renderer/infrastructure/ipc/channels.ts').read_text()`
  - `for name in ['SEND_CHANNELS','INVOKE_CHANNELS','ON_CHANNELS']:`
  - `    block=re.search(rf'{name}\\s*=\\s*\\{{(.*?)\\}}\\s*as const;', text, re.S).group(1)`
  - `    count=len([line for line in block.splitlines() if ':' in line])`
  - `    print(name.lower(), count)`
  - `PY`
- JSON-RPC mapper definition count:
  - `python - <<'PY'`
  - `import pathlib,re`
  - `text=pathlib.Path('frontend/src/main/local_backend_bridge_rpc_mappers.cjs').read_text()`
  - `print('compiled_rpc_handler_definitions', len(re.findall(r\"\\{\\s*channel:\", text)))`
  - `PY`

## Related Deep Dive

- [Frontend Protocol Lifecycle Hub](lifecycle/README.md)
- [Frontend Protocol Errors Hub](errors/README.md)
- [Frontend Protocol Validation Hub](validation/README.md)
