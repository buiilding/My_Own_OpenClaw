---
summary: "Workflow for adding, changing, or debugging WindieOS local-backend JSON-RPC methods across SDK local-runtime bridge mappings, Python sidecar method registration, payload normalization, timeouts, readiness, and tests."
read_when:
  - When adding, renaming, deleting, or changing a Python sidecar JSON-RPC method.
  - When a renderer IPC call reaches Electron main but does not reach the expected sidecar method, maps payload keys incorrectly, times out, or returns the wrong success/error envelope.
title: "Local Backend JSON-RPC Change Workflow"
---

# Local Backend JSON-RPC Change Workflow

Use this workflow when a change crosses the Electron main process into
`frontend/src/main/python/local_backend.py`. The active desktop bridge sends
JSON-RPC envelopes through the SDK local runtime provider to the sidecar daemon
`/rpc` endpoint. That boundary covers local tool execution, memory operations,
system-state collection, browser runtime setup, and a small set of local
permission/runtime utility calls.

This workflow is narrower than the general [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md). Start here when the work is specifically about a JSON-RPC method name, method params, Electron bridge mapper, request timeout, readiness behavior, or response envelope.

## Boundary Rules

- Renderer code must call the typed IPC bridge; it must not talk to the Python sidecar directly.
- Electron main owns channel registration, camelCase-to-snake_case payload mapping, request correlation, process readiness, timeouts, and screenshot/artifact wrappers.
- Python sidecar owns method registration, handler signatures, local validation, tool dispatch, memory storage, system-state collection, and local utility calls.
- Backend owns model-facing tool schemas and prompt policy. Do not import backend code into the sidecar to reuse those schemas.
- JSON-RPC method params must be JSON objects. Arrays, strings, and other non-object params are rejected by `JSONRPCProtocol`.
- Return JSON-serializable values only. Convert local exceptions into explicit JSON-RPC errors or `{ success:false, error }` envelopes at the right boundary.
- Keep stdout reserved for JSON-RPC responses. Logs belong on stderr through the sidecar logger.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Tests |
| --- | --- | --- | --- |
| Add a renderer-visible sidecar method | Electron IPC registry and mapper plus sidecar method registry | `frontend/src/shared/ipcChannels.json`, `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`, `frontend/src/main/python/local_backend.py` | preload/IPC tests, `tests/frontend/LocalBackendBridge*.test.cjs`, `tests/sidecar/test_local_backend.py` |
| Add a main-only sidecar helper | main bridge helper plus sidecar method registry | `frontend/src/main/sidecar/local_backend_bridge.cjs`, `frontend/src/main/python/local_backend.py` | focused frontend bridge tests, sidecar handler tests |
| Change JSON-RPC protocol validation | protocol core | `frontend/src/main/python/core/ipc_protocol.py` | `tests/sidecar/test_json_rpc_protocol.py` |
| Change request timeout or timeout error shape | SDK daemon client plus bridge timeout policy | `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_backend_bridge_timeout_policy.cjs` | SDK client tests and local-runtime bridge tests |
| Change sidecar readiness or status event behavior | SDK local runtime provider plus main supervisor and daemon status handlers | `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_backend_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs`, `frontend/src/main/python/sidecar_daemon.py`, `frontend/src/main/python/local_backend.py` | frontend lifecycle tests, SDK provider tests, sidecar daemon tests |
| Change memory method payloads | RPC mapper plus memory mixin | `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`, `frontend/src/main/python/local_backend_memory_handlers.py` | `tests/frontend/LocalBackendBridge.rpc.test.cjs`, sidecar memory/conversation tests |
| Change `execute_tool` behavior | SDK/main local tool runtime plus sidecar tool registry | `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`, `frontend/src/main/python/tools/registry.py`, specific tool module | SDK/main dispatch tests, sidecar tool tests |
| Change browser runtime install/warmup methods | main bridge helper plus local backend browser feature-pack handling | `frontend/src/main/sidecar/local_backend_bridge.cjs`, `frontend/src/main/python/local_backend.py`, browser feature-pack helpers | browser runtime and local-backend tests |
| Change macOS automation permission method | main permission bridge plus sidecar platform helper | `frontend/src/main/sidecar/local_backend_bridge.cjs`, `frontend/src/main/python/core/platform/macos_automation_permission.py`, `frontend/src/main/python/local_backend.py` | permission IPC tests, macOS automation sidecar tests |

## Method Families

### Direct Main Bridge Calls

These methods are invoked by focused helper code in `sidecar/local_backend_bridge.cjs`
or local tool runtime code rather than the compiled mapper table.

| Main-side entry | JSON-RPC method | Sidecar handler | Notes |
| --- | --- | --- | --- |
| scoped host channels / `executeToolForBackend(...)` | `execute_tool` | `_handle_execute_tool` | Runs sidecar tools through `ToolRegistry`; screenshot path may be materialized into backend artifacts by Electron main. |
| `get-system-state` IPC | `get_system_state` | `_handle_get_system_state` | Returns system/window/runtime state; failure normalizes to `null` in main helper paths. |
| status helper | `get_status` | `_handle_get_status` | Returns sidecar diagnostic status through SDK runtime RPC. |
| browser install helper | `install_browser_chromium` | `_handle_install_browser_chromium` | Main helper uses a long timeout for feature-pack/browser provisioning. |
| permission helper | `determine_macos_system_events_automation_permission` | `_handle_determine_macos_system_events_automation_permission` | Used by permission runtime for macOS System Events automation checks. |

### Compiled Mapper Calls

These renderer-visible channels are registered by `registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS)`.

| IPC channel | JSON-RPC method | Primary sidecar owner |
| --- | --- | --- |
| `search-chat-conversations` | `search_chat_conversations` | `LocalBackendMemoryHandlersMixin` |
| `list-chat-conversations` | `list_chat_conversations` | `LocalBackendMemoryHandlersMixin` |
| `list-episodic-memories` | `list_episodic_memories` | `LocalBackendMemoryHandlersMixin` |
| `get-chat-events` | `get_chat_events` | `LocalBackendMemoryHandlersMixin` |
| `list-semantic-memories` | `list_semantic_memories` | `LocalBackendMemoryHandlersMixin` |
| `delete-episodic-memory` | `delete_episodic_memory` | `LocalBackendMemoryHandlersMixin` |
| `delete-chat-conversation` | `delete_chat_conversation` | `LocalBackendMemoryHandlersMixin` |
| `delete-semantic-memory` | `delete_semantic_memory` | `LocalBackendMemoryHandlersMixin` |
| `clear-local-memory` | `clear_local_memory` | `LocalBackendMemoryHandlersMixin` |
| `clear-chat-history` | `clear_chat_history` | `LocalBackendMemoryHandlersMixin` |
| `store-chat-event` | `store_chat_event` | `LocalBackendMemoryHandlersMixin` |

Completed-turn memory writes are SDK-owned and call the sidecar directly through
`store_memory_by_embedding`; there is no renderer-visible `store-memory` IPC
channel.

## Add a Renderer-Visible JSON-RPC Method

1. Add the renderer channel to `frontend/src/shared/ipcChannels.json` under `INVOKE_CHANNELS`.
2. Confirm `frontend/src/renderer/infrastructure/ipc/channels.ts` exposes the channel through the typed constants used by renderer code.
3. Add a compiled mapper entry in `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`.
4. Use camelCase source keys for renderer payloads and snake_case target keys for sidecar params.
5. Register the Python method in `LocalBackend._initialize_methods`.
6. Implement the handler in `local_backend.py`, `local_backend_memory_handlers.py`, or a focused sidecar module.
7. Keep the handler signature explicit so `JSONRPCProtocol` can reject missing or unexpected params before execution.
8. Return a stable result envelope and avoid leaking tracebacks or local paths unless that is already the contract for the method.
9. Add frontend mapper/IPC tests and sidecar handler/protocol tests.
10. Link the new method from [Local Backend JSON-RPC Reference](local_backend_jsonrpc_reference.md) and the relevant domain doc.

## Add a Main-Only JSON-RPC Helper

Use this path when renderer does not need a general IPC channel, but Electron main needs a sidecar capability during startup, packaging, browser setup, permission checks, or diagnostics.

1. Add a helper function in `frontend/src/main/sidecar/local_backend_bridge.cjs` or a focused main-process module.
2. Call `sendRequestOrError(method, params, options)` unless callers should handle thrown errors.
3. Set a method-specific `timeoutMs` only when the operation is expected to exceed the default.
4. Register the sidecar method in `LocalBackend._initialize_methods`.
5. Implement and test the sidecar handler.
6. Export the main helper only if another main module needs to call it.
7. Update main-process docs if the helper affects startup, packaging, permission, browser, or runtime behavior.

## Payload Mapping Rules

`createPayloadMapper(fieldMap)` supports:

- direct source keys: `{ user_id: "userId" }`
- function mappers: `{ conversation_id: ({ conversationId }) => conversationId ?? null }`

Preserve these mapper guarantees:

- non-object renderer payloads normalize to `{}`.
- mapped params include each declared target key.
- string payload values are sanitized for known mojibake and lone surrogate issues before crossing into Python.
- renderer-facing fields usually stay camelCase.
- sidecar method params stay snake_case.
- use fallback arrays only when both names are intentionally supported.

Do not silently rename payload keys in only the renderer or only the mapper. If a key changes, update renderer caller, mapper, sidecar handler signature, tests, and docs together.

## Protocol and Readiness Rules

`JSONRPCProtocol` enforces:

- request payload must be a JSON object.
- `jsonrpc` must be `"2.0"`.
- `id` must be string, number, or null when present.
- notifications omit responses.
- method name must be a string.
- method must be registered.
- params must be an object.
- params must bind to the handler signature.
- sync and async handlers are both supported.
- `JSONRPCError` passes through its code/message/data.
- unhandled exceptions become JSON-RPC `INTERNAL_ERROR`.

Electron main readiness behavior:

- starts `local_backend.py` from the resolved sidecar launch target.
- passes backend endpoint, install-auth path, permission-state path, packaged-app flags, and Python runtime env.
- performs repeated `ping` readiness checks.
- marks the supervisor ready when ping succeeds.
- rejects all pending requests on sidecar process exit/error.
- parses stdout line by line; large JSON responses can be parsed in a worker thread.
- forwards allowed stderr lines as `[LocalSidecar] ...` logs while continuing
  to accept legacy local-backend-prefixed lines from older helper output.

When changing readiness, update process lifecycle docs and tests. Do not use arbitrary stdout logging from Python because it corrupts the JSON-RPC stream.

## Response and Error Shape Rules

Choose the response layer intentionally:

- Use a raw JSON-RPC result for low-level protocol methods such as `ping`.
- Use `{ success:true, data }` and `{ success:false, error }` for local backend operations that renderer/main treats as application results.
- Use `sendRequestOrError(...)` when main callers should receive error envelopes instead of rejected promises.
- Use thrown errors only when the caller is explicitly expected to catch request/transport failures.
- Keep tool execution errors as tool result errors so backend can receive model-visible tool outputs.

Avoid returning mixed shapes from one method. If a method currently returns a success/error envelope, keep that envelope stable unless every consumer and test is updated.

## Debug Routing Table

| Symptom | Check first |
| --- | --- |
| Renderer says invalid invoke channel | `frontend/src/shared/ipcChannels.json`, preload channel injection, renderer `channels.ts` |
| IPC handler runs but sidecar method not found | `COMPILED_RPC_HANDLER_DEFINITIONS`, `LocalBackend._initialize_methods`, method name spelling |
| Sidecar returns `INVALID_PARAMS` | mapper target keys, handler signature, params object shape |
| Request times out | sidecar readiness, long-running handler, timeout policy, stuck tool/browser/memory call |
| Sidecar process exits and requests fail | stderr logs, runtime dependency warnings, packaged sidecar launch target |
| JSON parse errors in main | Python stdout pollution, non-JSON output, partial/large response parsing |
| Method works in source but fails packaged | runtime dependency packaging, `WINDIE_PACKAGED_APP`, feature-pack availability, Python path resolution |
| Memory channel maps wrong user/conversation | camelCase-to-snake_case mapper, fallback keys, sidecar memory handler defaults |
| Tool result shape differs from renderer expectation | `ToolResult`, local tool runtime normalization, screenshot materialization wrapper |

## Validation Matrix

| Changed surface | Validation |
| --- | --- |
| JSON-RPC protocol validation | `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py` |
| LocalBackend method registry or handler | `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py` plus focused sidecar tests |
| Memory RPC method or mapper | `./scripts/python-in-env sidecar pytest tests/sidecar/test_memory_*.py tests/sidecar/test_conversation_*runtime.py` and `cd frontend && npm run test -- LocalBackendBridge.rpc` |
| Electron bridge mapper | `cd frontend && npm run test -- LocalBackendBridge.rpc` |
| Execute-tool bridge behavior | `cd frontend && npm run test -- LocalBackendBridge ToolExecution` plus focused sidecar tool tests |
| Preload/renderer IPC channel addition | `cd frontend && npm run test -- PreloadIpcChannels IpcBridge` |
| Sidecar process lifecycle/readiness | local-runtime bridge lifecycle tests and `tests/sidecar/test_runtime_shutdown.py` when shutdown changes |
| Docs-only JSON-RPC changes | `bin/windie docs list`, `git diff --check`, focused Markdown link checks |

## Documentation Checklist

When a method changes, update the closest docs in the same commit:

- [Local Backend JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](../main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md)
- [IPC Change Workflow](../ipc_change_workflow.md) when renderer channels change
- [Sidecar and Tool Channels](../../channels/sidecar_and_tool_channels.md) when tool or memory channel behavior changes
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md) for memory-specific payloads
- domain docs for browser, memory, tools, permissions, or system state

## Related Docs

- [Local Backend JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md)
- [IPC Change Workflow](../ipc_change_workflow.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](../main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Local Backend Process Lifecycle Reference](local_backend_process_lifecycle_reference.md)
