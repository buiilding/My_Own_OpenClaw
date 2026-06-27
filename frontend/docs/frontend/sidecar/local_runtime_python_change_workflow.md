---
summary: "Workflow for changing local-runtime Python implementation behavior across JSON-RPC methods, local tools, memory services, browser automation, platform adapters, backend config, system state, and wakeword service boundaries."
read_when:
  - When changing `frontend/src/main/python`, local-runtime JSON-RPC methods, local tool registry behavior, memory storage/search/summarization, browser runtime internals, system-state probes, platform adapters, backend URL resolution, or wakeword service framing.
  - When a local tool, memory, browser, wakeword, system-state, or local-runtime startup failure could belong to Electron main bridge, local-runtime Python code, backend-hosted APIs, or renderer projection.
title: "Local-Runtime Python Implementation Change Workflow"
---

# Local-Runtime Python Implementation Change Workflow

Use this workflow when behavior is implemented by local-runtime Python behind the
local-runtime boundary. The local runtime owns local-machine actions and local
data services: executable tools, browser automation, local memory
storage/search, system state, platform adapters, wakeword service protocol,
backend URL clients, and JSON-RPC method handling. Local-runtime Python provides
the current concrete implementation for those surfaces.

The local-runtime Python implementation is not the model-facing policy owner. Backend
owns model-visible tool schemas, provider policy, prompt construction, and
hosted route auth. Electron main owns process startup, IPC channel registration,
native windows, and request transport. Renderer owns UI state and tool-result
envelope orchestration.

## Fast Owner Map

| Symptom or request | Local-runtime implementation owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| Add or change a Python JSON-RPC method | Python JSON-RPC handler registry and protocol | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/core/ipc_protocol.py`, SDK local-runtime caller code when renderer-visible | `tests/sidecar/test_json_rpc_protocol.py`, `tests/sidecar/test_local_backend.py`, focused SDK/local-runtime caller tests | [Local Runtime JSON-RPC Change Workflow](local_backend_jsonrpc_change_workflow.md), [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md), [Main Process Change Workflow](../main/main_process_change_workflow.md) |
| Tool exists in renderer/main but the local runtime rejects or executes it incorrectly | Tool registry and executable tool implementation | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools`, `frontend/src/main/python/tools/result.py` | `tests/sidecar/test_tool_registry.py`, `tests/sidecar/test_tool_result.py`, focused tool tests | [Local-Runtime Tool Change Workflow](../local_runtime_tool_change_workflow.md), [Local-Runtime Tool Catalog](tool_catalog_and_execution_model.md) |
| Tool schema parity drift or exposed executable fields change | Local-runtime executable schema/export contract | `frontend/src/main/python/tools/schemas.py`, `frontend/src/main/python/tools/manifest.py`, `frontend/src/main/python/tools/*` | `tests/sidecar/test_tool_schemas.py`, `tests/sidecar/test_shared_tool_schema_parity.py` | [Local-Runtime Registry and Result Contract](tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md) |
| Filesystem read/replace behavior changes | Filesystem tools and path resolution | `frontend/src/main/python/tools/filesystem/*`, `frontend/src/main/python/tools/path_resolution.py` | `tests/sidecar/test_read_file_tool.py`, `tests/sidecar/test_replace_tool.py`, filesystem tool tests | [Filesystem Read and Replace](tools/filesystem_read_replace_runtime_reference.md) |
| Shell/process/open-app/wait/stats behavior changes | System tools and process registry | `frontend/src/main/python/tools/system/*` | `tests/sidecar/test_shell_process_tool.py`, `tests/sidecar/test_shell_process_registry.py`, `tests/sidecar/test_system_tools.py` | [Shell and Process Session Runtime](tools/shell_and_process_session_runtime_reference.md), [Local-Runtime System Tools Docs Hub](tools/system/README.md) |
| Mouse, keyboard, scroll, screenshot, or local window action changes | Computer tools plus platform adapters | `frontend/src/main/python/tools/computer/*`, `frontend/src/main/python/core/platform/*` | `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_scroll_tool.py`, `tests/sidecar/test_screenshot_tool.py`, platform tests | [Computer Tools Runtime](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md), [System-State Platform Adapter Reference](system_state/platform/system_state_probe_layer_and_window_manager_adapter_boundary_reference.md) |
| Browser launch, session, action, extraction, snapshot, file, or role ref behavior changes | Local-runtime browser implementation | `frontend/src/main/python/tools/browser/*`, `frontend/src/main/python/windie_shared/browser_contract*` | `tests/sidecar/test_browser_registry.py`, `tests/sidecar/tools/test_browser_*.py` | [Local-Runtime Browser Docs Hub](browser/README.md), [Browser Automation Stack](browser_automation_stack.md) |
| Local memory search, transcript rows, conversation list/window/search, semantic memory, or summarizer changes | Local-runtime memory implementation and storage | `frontend/src/main/python/memory/*`, `frontend/src/main/python/local_backend_memory_handlers.py` | `tests/sidecar/test_memory_*.py`, `tests/sidecar/test_conversation_*runtime.py`, `tests/sidecar/test_memory_operations.py` | [Local Runtime Memory Hub](memory/README.md), [Memory Pipeline and Summarization](memory_pipeline_and_summarization.md) |
| Backend URL, remote semantic client, or local-runtime API token forwarding changes | Local-runtime backend config and remote semantic client implementation | `frontend/src/main/python/windie/_backend_config.py`, `frontend/src/main/python/windie/_remote_api_client_base.py`, `frontend/src/main/python/core/remote_semantic_client.py` | `tests/sidecar/test_backend_config.py`, `tests/sidecar/test_remote_semantic_client.py` | [Backend Config Env-Precedence Reference](core/backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md), [Remote Semantic Client Reference](core/remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md), Runtime Configuration Matrix (private backend docs) |
| System-state payload is stale, missing, or platform-specific | System-state collector and platform probe layer | `frontend/src/main/python/core/system_state.py`, `frontend/src/main/python/core/platform/*`, `frontend/src/main/python/tools/system/window_tool.py` | `tests/sidecar/test_system_state.py`, `tests/sidecar/test_platform_module_selection.py`, platform window-manager tests | [System-State Collection](system_state/system_state_collection_and_platform_adapter_reference.md), [System-State Platform Adapter Reference](system_state/platform/system_state_probe_layer_and_window_manager_adapter_boundary_reference.md) |
| Local-runtime JSON-RPC request parsing, stdout framing, or daemon shutdown fails | JSON-RPC protocol, stdout JSON, and daemon lifecycle | `frontend/src/main/python/core/ipc_protocol.py`, `frontend/src/main/python/core/stdout_json.py`, `frontend/src/main/python/sidecar_daemon.py`, `frontend/src/main/python/local_backend.py` | `tests/sidecar/test_stdout_json.py`, `tests/sidecar/test_json_rpc_protocol.py`, `tests/sidecar/test_sidecar_daemon.py` | [JSON-RPC Protocol and Stdout Framing](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md), [SDK-Owned Local-Runtime Lifecycle](local_backend_process_lifecycle_reference.md) |
| Wakeword service model bootstrap, binary frames, or service lifecycle changes | Local-runtime wakeword service implementation | `frontend/src/main/python/wakeword_service.py`, `frontend/src/main/python/core/ipc_protocol.py` | `tests/sidecar/test_wakeword_service.py` plus frontend bridge tests when framing changes | [Wakeword Service Model Bootstrap](services/wakeword_service_model_bootstrap_and_binary_framing_reference.md), [Wakeword Bridge and Audio Framing](wakeword_bridge_and_audio_framing_reference.md) |

## Boundary Rules

- Do not import backend code into local-runtime Python to mirror model-facing schemas. Use explicit local-runtime Python argument models and parity tests.
- Do not add renderer UI state or Electron window decisions to Python code. Return normalized data; let renderer/main own presentation/native orchestration.
- Do not make the local-runtime Python implementation depend on conda, source checkout paths, or system Python in packaged mode. Runtime dependencies belong in `frontend/src/main/python/requirements.runtime.txt` and packaging docs.
- Keep JSON-RPC results serializable and explicit: return success/error envelopes instead of leaking tracebacks or unserializable objects to Electron main.
- Browser runtime changes must preserve the dedicated browser/session ownership policy unless the browser docs and tests are updated.
- Memory writes must distinguish transcript rows, interaction rows, semantic rows, and summarizer candidates. Do not make every transcript row a semantic candidate by accident.
- Platform adapters should normalize OS differences for callers; avoid scattering platform branches through individual tools when an adapter exists.

## Change Sequence

1. **Classify the local-runtime Python surface.** Decide whether the implementation owner is JSON-RPC protocol, method handler, tool registry, specific tool family, memory runtime, browser runtime, platform adapter, backend config client, or wakeword service.
2. **Check Electron bridge ownership.** If renderer/main payload mapping changes, read [Main Process Change Workflow](../main/main_process_change_workflow.md) and update bridge tests with local-runtime Python tests.
3. **Keep local-runtime implementation and model-facing contracts aligned deliberately.** For tool changes, read [Local-Runtime Tool Change Workflow](../local_runtime_tool_change_workflow.md) before touching backend schemas.
4. **Update the owner module first.** Fix registry/method/tool/storage/platform code at the owner layer before adding tolerance in callers.
5. **Normalize errors at the boundary.** Convert local exceptions into local-runtime result errors or JSON-RPC errors with useful but non-secret messages.
6. **Add focused local-runtime Python tests.** Prefer unit tests around the exact tool, method, memory helper, browser contract, or platform adapter.
7. **Update docs and changelog.** Link new local-runtime Python surfaces from this workflow and the relevant sub-hub.

## JSON-RPC Method Checklist

When adding or changing a method:

- Register the method in `LocalRuntimeService._initialize_methods`.
- If renderer code will call it, add or extend an SDK-shaped command/facade and keep the local-runtime JSON-RPC call behind SDK local-runtime code rather than exposing a sidecar-named IPC channel.
- Validate params through handler signatures and explicit type checks.
- Add or update Electron main bridge code only for scoped host channels that require Electron authority.
- Keep snake_case local-runtime JSON-RPC params and document any camelCase bridge mapping.
- Return stable JSON-serializable payloads.
- Add local-runtime Python protocol tests and SDK/local-runtime caller tests when the renderer-visible payload changes.

## Tool Runtime Checklist

When changing a local executable tool:

- Decide whether the backend model-visible schema must change. If yes, update backend schema/tests/docs too.
- Keep `ToolResult` success/error shape stable.
- Keep tool registry registration and exposed tool metadata in sync.
- Preserve local authority boundaries for filesystem, shell, browser, screenshot, input, and window actions.
- Add tests for valid input, invalid input, runtime failure, and normalized result shape.

## Memory Runtime Checklist

When changing local-runtime memory implementation:

- Preserve record-kind semantics: transcript rows, interaction rows, semantic rows, and metadata/watermark rows have different jobs.
- Keep embedding unavailability non-fatal where the existing contract allows local writes without embeddings.
- Update conversation list/search/window runtime tests when stored row shape or grouping changes.
- Keep FAISS/SQLite cleanup behavior explicit when deleting conversations or semantic memories.
- Update backend remote client docs/tests if local-runtime memory starts calling a hosted route differently.

## Browser Runtime Checklist

When changing browser behavior:

- Preserve session ownership and ref registry guarantees.
- Keep action schema validation and OpenClaw-compatible field behavior documented.
- Update Chrome detection/launcher tests when browser selection changes.
- Update browser-use docs/tests when vendored browser-use internals or adapters change.
- Keep extraction deterministic unless the docs and runtime intentionally introduce an LLM-dependent path.

## Platform and System-State Checklist

When changing platform adapters or system state:

- Keep OS-specific probes under `core/platform/*` when possible.
- Normalize payloads before returning them through JSON-RPC.
- Update macOS, Windows, and Linux tests or docs when behavior differs.
- Keep screenshot/window/input changes aligned with [Platform Change Workflow](../../platforms/platform_change_workflow.md).

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| JSON-RPC protocol or method registry | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py` |
| Tool registry/schema/result | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_schemas.py tests/sidecar/test_tool_result.py` |
| Filesystem/shell/computer/system tool | Focused `tests/sidecar/test_*_tool.py` for that tool family |
| Browser runtime | `./scripts/python-in-env local-runtime pytest tests/sidecar/tools` plus focused browser runtime tests |
| Memory runtime/storage | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_memory_*.py tests/sidecar/test_conversation_*runtime.py` |
| Backend config/remote semantic client | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_backend_config.py tests/sidecar/test_remote_semantic_client.py` |
| Wakeword service | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_wakeword_service.py` plus frontend wakeword bridge tests if framing changes |
| Docs-only local-runtime Python workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing local-runtime Python work:

- Did the change belong to local-runtime Python rather than backend policy, Electron main orchestration, or renderer projection?
- Did JSON-RPC and Electron bridge payloads stay explicit and tested when they changed?
- Did packaged runtime dependencies and source-mode imports stay separated?
- Did local authority boundaries remain clear for filesystem, shell, browser, screenshot, input, and window operations?
- Did memory row kinds and semanticization behavior stay intentional?
- Did tests cover success, invalid input, and failure normalization for the changed executable path?
- Did docs and `CHANGELOG.md` move with behavior or contract changes?

## Related Docs

- [Local Runtime Python Implementation Docs Hub](README.md)
- [Local Runtime JSON-RPC Change Workflow](local_backend_jsonrpc_change_workflow.md)
- [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local-Runtime Tool Change Workflow](../local_runtime_tool_change_workflow.md)
- [Local-Runtime Tool Catalog and Execution Model](tool_catalog_and_execution_model.md)
- [Local Runtime Memory Hub](memory/README.md)
- [Local-Runtime Browser Docs Hub](browser/README.md)
- [System-State Collection](system_state/system_state_collection_and_platform_adapter_reference.md)
- [Wakeword Bridge and Audio Framing](wakeword_bridge_and_audio_framing_reference.md)
