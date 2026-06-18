---
summary: "Workflow for adding, changing, or debugging WindieOS local-runtime JSON-RPC methods across SDK local-runtime callers, Python sidecar method registration, payload normalization, timeouts, readiness, and tests."
read_when:
  - When adding, renaming, deleting, or changing a Python sidecar JSON-RPC method.
  - When an SDK local-runtime call reaches Electron main or the daemon but does not reach the expected sidecar method, maps payload keys incorrectly, times out, or returns the wrong success/error envelope.
title: "Local Runtime JSON-RPC Change Workflow"
---

# Local Runtime JSON-RPC Change Workflow

Use this workflow when a change crosses the Electron main process into
`frontend/src/main/python/local_backend.py`. The active desktop bridge sends
JSON-RPC envelopes through the SDK local runtime provider to the sidecar daemon
`/rpc` endpoint. That boundary covers local tool execution, memory operations,
system-state collection, browser runtime setup, and a small set of local
permission/runtime utility calls.

This workflow is narrower than the general [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md). Start here when the work is specifically about a JSON-RPC method name, method params, SDK local-runtime caller, request timeout, readiness behavior, or response envelope.

## Boundary Rules

- Renderer code must call SDK-shaped `window.agentSdk.invoke(...)` commands or typed host IPC channels; it must not talk to the Python sidecar directly.
- Electron main owns scoped host channel registration, request correlation, process readiness, timeouts, and screenshot/artifact wrappers.
- Python sidecar owns method registration, handler signatures, local validation, tool dispatch, memory storage, system-state collection, and local utility calls.
- Backend owns model-facing tool schemas and prompt policy. Do not import backend code into the sidecar to reuse those schemas.
- JSON-RPC method params must be JSON objects. Arrays, strings, and other non-object params are rejected by `JSONRPCProtocol`.
- Return JSON-serializable values only. Convert local exceptions into explicit JSON-RPC errors or `{ success:false, error }` envelopes at the right boundary.
- Keep stdout reserved for JSON-RPC responses. Logs belong on stderr through the sidecar logger.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Tests |
| --- | --- | --- | --- |
| Add a renderer-visible local-runtime capability | SDK command/facade plus Python sidecar method registry | SDK runtime command owner, renderer facade, `frontend/src/main/python/local_backend.py` | SDK command tests, focused renderer facade tests, Python sidecar handler tests |
| Add a main-only Python sidecar helper | main bridge helper plus Python sidecar method registry | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/python/local_backend.py` | focused frontend bridge tests, Python sidecar handler tests |
| Change JSON-RPC protocol validation | protocol core | `frontend/src/main/python/core/ipc_protocol.py` | `tests/sidecar/test_json_rpc_protocol.py` |
| Change request timeout or timeout error shape | SDK daemon client plus bridge timeout policy | `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_runtime_timeout_policy.cjs` | SDK client tests and local-runtime bridge tests |
| Change Python sidecar readiness or status event behavior | SDK local runtime provider plus main supervisor and daemon status handlers | `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs`, `frontend/src/main/python/sidecar_daemon.py`, `frontend/src/main/python/local_backend.py` | frontend lifecycle tests, SDK provider tests, Python sidecar daemon tests |
| Change memory method payloads | SDK local-runtime store plus Python memory mixin | SDK local-runtime store code, `frontend/src/main/python/local_backend_memory_handlers.py` | SDK local-runtime store tests, Python sidecar memory/conversation tests |
| Change `execute_tool` behavior | SDK/main local tool runtime plus Python sidecar tool registry | `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`, `frontend/src/main/python/tools/registry.py`, specific tool module | SDK/main dispatch tests, Python sidecar tool tests |
| Change browser runtime install/warmup methods | main bridge helper plus local-runtime browser feature-pack handling | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/python/local_backend.py`, browser feature-pack helpers | browser runtime and local-runtime tests |
| Change macOS automation permission method | main permission bridge plus Python sidecar platform helper | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/python/core/platform/macos_automation_permission.py`, `frontend/src/main/python/local_backend.py` | permission IPC tests, macOS automation Python sidecar tests |

## Method Families

### Direct Main Bridge Calls

These methods are invoked by focused helper code in `sidecar/local_runtime_bridge.cjs`
or local tool runtime code rather than the compiled mapper table.

| Main-side entry | JSON-RPC method | Sidecar handler | Notes |
| --- | --- | --- | --- |
| scoped host channels / `executeToolForBackend(...)` | `execute_tool` | `_handle_execute_tool` | Runs sidecar tools through `ToolRegistry`; screenshot path may be materialized into backend artifacts by Electron main. |
| `get-system-state` IPC | `get_system_state` | `_handle_get_system_state` | Returns system/window/runtime state; failure normalizes to `null` in main helper paths. |
| status helper | `get_status` | `_handle_get_status` | Returns sidecar diagnostic status through SDK runtime RPC. |
| browser install helper | `install_browser_chromium` | `_handle_install_browser_chromium` | Main helper uses a long timeout for feature-pack/browser provisioning. |
| permission helper | `determine_macos_system_events_automation_permission` | `_handle_determine_macos_system_events_automation_permission` | Used by permission runtime for macOS System Events automation checks. |

### Removed Direct Chat/Memory IPC Mapper Calls

Electron main no longer registers a compiled mapper table for renderer-visible
chat or memory sidecar methods. Removed direct channels include
`search-chat-conversations`, `list-chat-conversations`,
`list-episodic-memories`, `get-chat-events`,
`list-semantic-memories`, `delete-episodic-memory`,
`delete-chat-conversation`, `delete-semantic-memory`,
`clear-local-memory`, `clear-chat-history`, and `store-chat-event`.

Renderer-visible chat and memory actions enter through SDK-shaped commands such
as `conversations.list`, `conversations.search`, `conversation.load`,
`conversation.delete`, `conversations.clearAll`, `memories.list`,
`memories.delete`, and `memories.clearAll`. The SDK local-runtime store owns the
Python sidecar JSON-RPC calls behind those commands.

Completed-turn memory writes are SDK-owned and call the local runtime through
`store_memory_by_embedding`; there is no renderer-visible `store-memory` IPC
channel.

## Add a Renderer-Visible Local-Runtime Capability

1. Add or extend a typed SDK runtime command/facade for the renderer-visible
   action.
2. Keep renderer payloads in the SDK command contract; do not expose sidecar
   JSON-RPC method names as renderer invoke channels.
3. Add or update the SDK local-runtime store/client call that builds the
   local-runtime JSON-RPC method and params.
4. Register the Python method in `LocalRuntimeService._initialize_methods`.
5. Implement the handler in `local_backend.py`,
   `local_backend_memory_handlers.py`, or a focused sidecar module.
6. Keep the handler signature explicit so `JSONRPCProtocol` can reject missing
   or unexpected params before execution.
7. Return a stable result envelope and avoid leaking tracebacks or local paths
   unless that is already the contract for the method.
8. Add SDK command/store tests, renderer facade tests when applicable, and
   sidecar handler/protocol tests.
9. Link the new method from [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md) and the relevant domain doc.

## Add a Main-Only JSON-RPC Helper

Use this path when renderer does not need a general IPC channel, but Electron main needs a sidecar capability during startup, packaging, browser setup, permission checks, or diagnostics.

1. Add a helper function in `frontend/src/main/sidecar/local_runtime_bridge.cjs` or a focused main-process module.
2. Call `sendRequestOrError(method, params, options)` unless callers should handle thrown errors.
3. Set a method-specific `timeoutMs` only when the operation is expected to exceed the default.
4. Register the sidecar method in `LocalRuntimeService._initialize_methods`.
5. Implement and test the sidecar handler.
6. Export the main helper only if another main module needs to call it.
7. Update main-process docs if the helper affects startup, packaging, permission, browser, or runtime behavior.

## Payload Mapping Rules

Preserve these payload guarantees:

- renderer-facing SDK command fields usually stay camelCase.
- Python JSON-RPC method params stay snake_case.
- non-object or malformed renderer payloads should fail at the SDK command
  boundary rather than being silently coerced into sidecar params.
- string payload values that cross into Python should be sanitized at the
  owning SDK/store boundary when that method accepts user-authored text.
- use fallback aliases only when both names are intentionally public and
  tested.

Do not silently rename payload keys in only the renderer or only the SDK
local-runtime caller. If a key changes, update renderer caller, SDK command,
sidecar handler signature, tests, and docs together.

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

- starts `sidecar_daemon.py` from the resolved sidecar launch target.
- passes backend endpoint, install-auth path, permission-state path, packaged-app flags, and Python runtime env.
- performs repeated `ping` readiness checks.
- marks the supervisor ready when ping succeeds.
- rejects all pending requests on sidecar process exit/error.
- parses stdout line by line; large JSON responses can be parsed in a worker thread.
- forwards allowed stderr lines with active sidecar daemon, local-runtime, tool,
  and MCP prefixes; retired local-backend-prefixed helper lines are not part of
  the host forwarding allowlist.

When changing readiness, update process lifecycle docs and tests. Do not use arbitrary stdout logging from Python because it corrupts the JSON-RPC stream.

## Response and Error Shape Rules

Choose the response layer intentionally:

- Use a raw JSON-RPC result for low-level protocol methods such as `ping`.
- Use `{ success:true, data }` and `{ success:false, error }` for local-runtime operations that renderer/main treats as application results.
- Use `sendRequestOrError(...)` when main callers should receive error envelopes instead of rejected promises.
- Use thrown errors only when the caller is explicitly expected to catch request/transport failures.
- Keep tool execution errors as tool result errors so backend can receive model-visible tool outputs.

Avoid returning mixed shapes from one method. If a method currently returns a success/error envelope, keep that envelope stable unless every consumer and test is updated.

## Debug Routing Table

| Symptom | Check first |
| --- | --- |
| Renderer says invalid invoke channel | SDK command allowlist, preload channel injection, renderer facade call site |
| SDK local-runtime call runs but sidecar method not found | SDK local-runtime method name, `LocalRuntimeService._initialize_methods`, method name spelling |
| Sidecar returns `INVALID_PARAMS` | SDK local-runtime params, handler signature, params object shape |
| Request times out | sidecar readiness, long-running handler, timeout policy, stuck tool/browser/memory call |
| Sidecar process exits and requests fail | stderr logs, runtime dependency warnings, packaged sidecar launch target |
| JSON parse errors in main | Python stdout pollution, non-JSON output, partial/large response parsing |
| Method works in source but fails packaged | runtime dependency packaging, `AGENT_PACKAGED_APP` / `WINDIE_PACKAGED_APP`, feature-pack availability, Python path resolution |
| Memory command maps wrong user/conversation | SDK local-runtime store params, fallback keys, Python memory handler defaults |
| Tool result shape differs from renderer expectation | `ToolResult`, local tool runtime normalization, screenshot materialization wrapper |

## Validation Matrix

| Changed surface | Validation |
| --- | --- |
| JSON-RPC protocol validation | `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py` |
| LocalRuntimeService method registry or handler | `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py` plus focused Python sidecar tests |
| Memory RPC method or SDK local-runtime caller | `./scripts/python-in-env sidecar pytest tests/sidecar/test_memory_*.py tests/sidecar/test_conversation_*runtime.py` plus focused SDK local-runtime store tests |
| Electron bridge handler | `cd frontend && npm run test -- LocalRuntimeBridge.rpc` |
| Execute-tool bridge behavior | `cd frontend && npm run test -- LocalRuntimeBridge ToolExecution` plus focused Python sidecar tool tests |
| Preload/renderer IPC channel addition | `cd frontend && npm run test -- PreloadIpcChannels IpcBridge` |
| Python sidecar process lifecycle/readiness | local-runtime bridge lifecycle tests and `tests/sidecar/test_sidecar_daemon.py` when shutdown changes |
| Docs-only JSON-RPC changes | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Documentation Checklist

When a method changes, update the closest docs in the same commit:

- [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](../main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md)
- [IPC Change Workflow](../ipc_change_workflow.md) when renderer channels change
- [Sidecar and Tool Channels](../../channels/sidecar_and_tool_channels.md) when tool or memory channel behavior changes
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md) for memory-specific payloads
- domain docs for browser, memory, tools, permissions, or system state

## Related Docs

- [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Sidecar Runtime Change Workflow](sidecar_runtime_change_workflow.md)
- [IPC Change Workflow](../ipc_change_workflow.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](../main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [JSON-RPC Protocol and Stdout Framing Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [SDK-Owned Sidecar Lifecycle Reference](local_backend_process_lifecycle_reference.md)
