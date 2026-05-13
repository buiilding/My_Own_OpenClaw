---
summary: "Workflow for changing WindieOS sidecar-executed tools across backend model schema, renderer tool execution, Electron local-backend bridge, Python JSON-RPC, and sidecar tests."
read_when:
  - When adding, changing, or debugging a local executable tool.
  - When a model-visible tool call reaches the renderer but fails in the sidecar.
  - When deciding whether a tool change belongs to backend schema, renderer dispatch, Electron bridge, or Python sidecar code.
title: "Sidecar Tool Change Workflow"
---

# Sidecar Tool Change Workflow

WindieOS tool execution crosses four layers:

1. Backend exposes model-facing tool schemas and receives tool results.
2. Renderer interprets streamed tool-call events and builds backend result envelopes.
3. Electron main bridges renderer invokes to the Python sidecar.
4. Python sidecar executes local actions and returns simple executable results.

Do not make the sidecar import backend schemas. Keep parity in explicit tests and docs.

## Ownership Map

| Layer | Code roots | Owns |
| --- | --- | --- |
| Backend schema and policy | `backend/src/tools`, `backend/src/agent/tools`, `backend/src/tools/tool_selection.py` | Model-visible tool names, descriptions, JSON schema, policy/profile filtering, tool-call history. |
| Renderer tool execution | `frontend/src/renderer/infrastructure/services/toolExecution`, `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts` | Tool-call event consumption, bundle/single execution, screenshot capture, backend result envelope. |
| Electron main bridge | `frontend/src/main/ipc.cjs`, `frontend/src/main/local_backend_bridge*.cjs` | `execute-tool` invoke handler, sidecar request transport, payload mapping, timeouts, display/window context. |
| Python sidecar | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools` | JSON-RPC handlers, local tool registry, filesystem/shell/computer/browser/system/memory execution. |
| Tests | `tests/backend`, `tests/frontend`, `tests/sidecar` | Contract, dispatch, execution, and result parity. |

## Add or Change a Tool

| Step | What to inspect | Why |
| --- | --- | --- |
| 1. Decide model-facing behavior | `backend/src/tools` and [Tool Catalog Matrix](../tools/tool_catalog_matrix.md) | The backend owns what the model can request. |
| 2. Decide executable payload | `frontend/src/main/python/tools` and sidecar registry docs | The sidecar owns what can actually run locally. |
| 3. Map backend call to local execution | Renderer `toolExecution` services and Electron local backend bridge | Tool-call shape must become a sidecar action without losing ids, artifacts, or display context. |
| 4. Normalize result envelope | `ToolResultEnvelope`, backend tool-result handler, sidecar tool result models | Backend history needs consistent success/error output. |
| 5. Add validation | Backend schema tests, frontend tool-runner tests, sidecar tool tests | Drift is caught by producer and consumer tests, not imports. |
| 6. Update docs | Tool docs, sidecar docs, code-change routing docs | Agents should know where to modify the next related behavior. |

## Tool Families

| Family | Backend schema roots | Sidecar roots | Focused tests |
| --- | --- | --- | --- |
| Computer/mouse/keyboard/screenshot/window | `backend/src/tools/computer`, `backend/src/tools/remote_tools` | `frontend/src/main/python/tools/computer`, platform adapters | `tests/backend/test_computer_use_schema_contract.py`, `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_screenshot_tool.py` |
| Browser | `backend/src/tools/browser` | `frontend/src/main/python/tools/browser` | `tests/backend/test_browser_remote_tool.py`, `tests/sidecar/tools/test_browser_tool.py`, browser schema/runtime tests |
| Filesystem and shell | `backend/src/tools/filesystem`, `backend/src/tools/system` | `frontend/src/main/python/tools/filesystem`, `frontend/src/main/python/tools/system` | `tests/sidecar/test_read_file_tool.py`, `tests/sidecar/test_replace_tool.py`, `tests/sidecar/test_shell_process_tool.py` |
| Memory | Backend memory routes and prompt context | `frontend/src/main/python/tools/memory`, `frontend/src/main/python/memory` | `tests/sidecar/test_memory_tool.py`, memory route and transcript tests |
| System state and app/window helpers | `backend/src/tools/system`, prompt/tool context | `frontend/src/main/python/tools/system`, Electron window/display bridge | `tests/sidecar/test_system_tools.py`, frontend display/window tests |

## Result Contract

| Field or behavior | Owner | Rule |
| --- | --- | --- |
| Tool name and call id | Backend event plus renderer tool runner | Preserve ids through execution and result submission. |
| Success/failure status | Sidecar result and renderer envelope | Failures should be explicit and serializable, not thrown away. |
| Screenshot/artifact refs | Renderer capture/upload plus backend artifact route | Upload artifacts before backend result submission when model history needs durable refs. |
| Display/window context | Renderer capture, Electron bridge, sidecar platform tools | Capture context at the boundary closest to the UI event, then pass normalized payloads. |
| Backend history entry | Backend tool-result handler | Tool output must re-enter backend history under the correct conversation/turn. |

## Common Drift Patterns

| Drift | Fix |
| --- | --- |
| Backend schema accepts a field that sidecar rejects | Update sidecar validator/mapper or remove the model-facing field, then add parity coverage. |
| Sidecar supports an action the model cannot call | Decide whether to expose it in backend schema or keep it internal-only and document that boundary. |
| Renderer drops payload fields | Update `ToolExecutionPayloads`, backend envelope builder, and focused frontend tests. |
| Tool works alone but bundle fails | Inspect bundle runner ordering, result aggregation, and backend `tool-bundle-result` handling. |
| Screenshot tool changes break overlay behavior | Read platform screenshot/overlay policy and surface orchestrator docs before editing capture code. |

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| Backend schema or policy only | Focused backend schema/policy tests and docs-list. |
| Sidecar implementation only | Focused sidecar tests for the tool plus shared schema parity if exposed. |
| Renderer dispatch/envelope | Focused frontend `ToolExecution*` tests and backend result handler tests if envelope changes. |
| Cross-runtime tool change | Backend schema tests, frontend tool execution tests, sidecar tool tests, and docs-list. |
| Browser tool change | Browser backend tests, sidecar browser tests, and browser runtime docs update. |

## Related Docs

- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Tool Contracts](../tools/tool_contracts.md)
- [Sidecar Tool Catalog and Execution Model](sidecar/tool_catalog_and_execution_model.md)
- [Frontend Tool Execution Service and Hook Runtime Reference](renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Code Change Surface Index](../reference/code_change_surface_index.md)
