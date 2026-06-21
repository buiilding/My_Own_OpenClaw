---
summary: "Workflow for changing desktop local-runtime tools across backend model schema, SDK runtime dispatch, Electron local-runtime bridge, Python JSON-RPC implementation, and local-runtime tests."
read_when:
  - When adding, changing, or debugging a local executable tool.
  - When a model-visible tool call reaches the SDK runtime but fails in local-runtime execution.
  - When deciding whether a tool change belongs to backend schema, SDK dispatch, Electron bridge, or local-runtime Python code.
title: "Local-Runtime Tool Change Workflow"
---

# Local-Runtime Tool Change Workflow

Local-runtime tool execution crosses four layers:

1. Backend exposes model-facing tool schemas and receives tool results.
2. SDK runtime interprets streamed tool-call events and builds backend result envelopes.
3. Electron main hosts SDK desktop adapters and supplies host context to the SDK local runtime.
4. The local runtime executes local actions through the local-runtime Python implementation and returns simple executable results.

Do not make local-runtime Python import backend schemas. Keep parity in explicit tests and docs.

## Ownership Map

| Layer | Code roots | Owns |
| --- | --- | --- |
| Backend schema and policy | `backend/src/tools`, `backend/src/agent/tools`, `backend/src/tools/tool_selection.py` | Model-visible tool names, descriptions, JSON schema, policy/profile filtering, tool-call history. |
| SDK runtime dispatch | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts` | Tool-call event consumption, bundle/single orchestration, backend result envelope, normalized tool-output events. |
| Electron main bridge | `frontend/src/main/ipc.cjs`, `frontend/src/main/sidecar/local_runtime*.cjs`, `packages/windie-sdk-js/src/runtime/Agent.ts` | SDK local-runtime host context, payload mapping, timeouts, display/window context. |
| Local runtime implementation | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools` | Local-runtime JSON-RPC handlers backed by local-runtime Python modules, local tool registry, filesystem/shell/computer/browser/system execution, and local memory RPCs. |
| Tests | `tests/backend`, `tests/frontend`, `tests/sidecar` | Contract, dispatch, execution, and result parity. |

## Add or Change a Tool

| Step | What to inspect | Why |
| --- | --- | --- |
| 1. Decide model-facing behavior | `backend/src/tools` and [Tool Catalog Matrix](../tools/tool_catalog_matrix.md) | The backend owns what the model can request. |
| 2. Decide executable payload | `frontend/src/main/python/tools` and local-runtime executable registry docs | The local runtime owns what can actually run locally; the executable registry documents the current local-runtime Python implementation. |
| 3. Map backend call to local execution | SDK `ToolExecutionCoordinator`, Electron SDK tool router, and Electron local-runtime bridge | Tool-call shape must become a local-runtime executable action without losing ids, artifacts, or display context. |
| 4. Normalize result envelope | SDK result envelope builder, backend tool-result handler, local-runtime Python tool result models | Backend history needs consistent success/error output. |
| 5. Add validation | Backend schema tests, SDK/main tool-coordinator tests, local-runtime Python tool tests | Drift is caught by producer and consumer tests, not imports. |
| 6. Update docs | Tool docs, local-runtime implementation docs, code-change routing docs | Agents should know where to modify the next related behavior. |

## Tool Families

| Family | Backend schema roots | Local-runtime implementation roots | Focused tests |
| --- | --- | --- | --- |
| Computer/mouse/keyboard/screenshot/window | `backend/src/tools/computer`, `backend/src/tools/remote_tools` | `frontend/src/main/python/tools/computer`, platform adapters | `tests/backend/test_computer_use_schema_contract.py`, `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_screenshot_tool.py` |
| Browser | `backend/src/tools/browser` | `frontend/src/main/python/tools/browser` | `tests/backend/test_browser_remote_tool.py`, `tests/sidecar/tools/test_browser_tool.py`, browser schema/runtime tests |
| Filesystem and shell | `backend/src/tools/filesystem`, `backend/src/tools/system` | `frontend/src/main/python/tools/filesystem`, `frontend/src/main/python/tools/system` | Start with [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md); then inspect `tests/sidecar/test_read_file_tool.py`, `tests/sidecar/test_replace_tool.py`, `tests/sidecar/test_shell_process_tool.py`, bridge tests, and SDK/main tool-dispatch tests. |
| Memory | Backend memory routes and prompt context | `frontend/src/main/python/memory`, `frontend/src/main/python/local_backend_memory_handlers.py` | `tests/sidecar/test_memory_*.py`, memory route and transcript tests |
| System state and app/window helpers | `backend/src/tools/system`, prompt/tool context | `frontend/src/main/python/tools/system`, Electron window/display bridge | `tests/sidecar/test_system_tools.py`, frontend display/window tests |

## Result Contract

| Field or behavior | Owner | Rule |
| --- | --- | --- |
| Tool name and call id | Backend event plus SDK tool coordinator | Preserve ids through execution and result submission. |
| Success/failure status | Local-runtime result and SDK result envelope | Failures should be explicit and serializable, not thrown away. |
| Screenshot/artifact refs | Electron capture/upload plus backend artifact route | Upload artifacts before backend result submission when model history needs durable refs. |
| Display/window context | Electron bridge, renderer-visible surface state, local-runtime platform tools | Capture context at the boundary closest to the UI event, then pass normalized payloads. |
| Backend history entry | Backend tool-result handler | Tool output must re-enter backend history under the correct conversation/turn. |

## Common Drift Patterns

| Drift | Fix |
| --- | --- |
| Backend schema accepts a field that the local runtime rejects | Update the local-runtime validator/mapper or remove the model-facing field, then add parity coverage. |
| Local runtime supports an action the model cannot call | Decide whether to expose it in backend schema or keep it internal-only and document that boundary. |
| SDK/main drops payload fields | Update SDK tool payload normalization, backend envelope builder, and focused frontend tests. |
| Tool works alone but bundle fails | Inspect bundle runner ordering, result aggregation, and backend `tool-bundle-result` handling. |
| Screenshot tool changes break overlay behavior | Read platform screenshot/overlay policy and surface orchestrator docs before editing capture code. |

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| Backend schema or policy only | Focused backend schema/policy tests and `<windie> docs list`. |
| Local-runtime Python implementation only | Focused local-runtime Python tests for the tool plus shared schema parity if exposed. |
| SDK/main dispatch/envelope | Focused SDK/main tool-coordinator tests and backend result handler tests if envelope changes. |
| Cross-runtime tool change | Backend schema tests, SDK/main dispatch tests, local-runtime Python tool tests, and `<windie> docs list`. |
| Browser tool change | Browser backend tests, local-runtime browser implementation tests, and browser runtime docs update. |

## Related Docs

- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Contracts](../tools/tool_contracts.md)
- [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md)
- [Local-Runtime Tool Catalog and Execution Model](sidecar/tool_catalog_and_execution_model.md)
- [Windie Client Runtime](../sdk/windie_client_runtime.md)
- [Code Change Surface Index](../reference/code_change_surface_index.md)
