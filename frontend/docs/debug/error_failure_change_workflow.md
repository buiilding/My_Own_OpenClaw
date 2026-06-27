---
summary: "Workflow for changing runtime error and failure surfaces across backend exceptions, websocket error envelopes, HTTP errors, Electron IPC/reconnect failures, local-runtime ToolResult errors, renderer error UI, and sanitized logs."
read_when:
  - When changing exception mapping, websocket error envelopes, HTTP error responses, IPC failure behavior, local-runtime ToolResult failures, renderer error display, synthetic query failures, settings ACK timeouts, or log sanitization.
  - When debugging an error that is swallowed, overexposed, missing context, rendered in the wrong UI, retried forever, or visible in one runtime but not another.
title: "Error and Failure Change Workflow"
---

# Error and Failure Change Workflow

Use this workflow when a change affects how the runtime fails, reports failure, recovers, retries, logs, or displays errors. Most regressions here come from fixing the visible symptom in the consumer while the producer is still emitting the wrong contract.

Core rule: preserve the failure boundary. Backend errors should stay sanitized before crossing hosted transports, Electron should normalize bridge/process failures without hiding readiness state, local-runtime tools should return structured `ToolResult` failures, and renderer UI should display or recover from canonical payloads rather than inventing runtime semantics.

## Fast Owner Map

| Failure surface | First owner | Code roots | Tests to inspect or add | Start docs |
| --- | --- | --- | --- | --- |
| Backend exception hierarchy and metadata | Backend core infrastructure | `backend/src/core/infrastructure/error_types/**`, `backend/src/core/infrastructure/user_facing_errors.py` | `tests/backend/test_exceptions.py`, `tests/backend/test_api_errors.py` | [Backend Exception Hierarchy](../backend/core/exception_hierarchy_and_metadata_propagation_reference.md) |
| Websocket incoming validation and sanitized error envelope | Backend API/websocket | `backend/src/api/infrastructure/errors.py`, `backend/src/api/routes/websocket/message_handler.py`, `backend/src/api/transport/sender.py`, `backend/src/api/processing/formatters/error.py` | websocket/API error tests, formatter tests | [Handler Registry and Error Envelope Reference](../backend/api/handler_registry_and_error_envelope_reference.md) |
| HTTP route errors | Owning backend route/service | `backend/src/api/routes/**`, `backend/src/api/infrastructure/errors.py`, service helpers | route-specific backend tests | [API Route Change Workflow](../backend/api/api_route_change_workflow.md) |
| Model/tool parse recovery | Backend agent runtime | `backend/src/agent/recovery/**`, `backend/src/llm/parser_validation.py`, `backend/src/agent/execution/**` | parser validation, recovery, interaction-loop tests | [Tool-Call Error Recovery Reference](../backend/agent/recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md) |
| Tool result failure ingestion | Backend tool waiting/processing | `backend/src/api/handlers/tool_result.py`, `backend/src/agent/tools/waiting/**`, `backend/src/agent/tools/processing/**` | `tests/backend/test_tool_result_*.py`, `test_incoming_tool_result_schemas.py` | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) |
| Electron websocket send/reconnect failure | Electron main IPC bridge | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs` | `tests/frontend/IpcMainBridge*.test.cjs` | [Frontend IPC/WS Error Recovery Reference](../frontend/inventory/protocols/errors/frontend_ipc_ws_bridge_and_local_backend_error_recovery_contract_reference.md) |
| Preload IPC validation errors | Preload bridge and renderer IPC wrapper | `frontend/src/preload.js`, `frontend/src/renderer/infrastructure/ipc/**` | `tests/frontend/IpcBridgeValidation.test.ts` | [IPC Change Workflow](../frontend/ipc_change_workflow.md) |
| Local runtime JSON-RPC/process failure | Electron local runtime bridge | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_utils.cjs`, local-runtime Python process launch helpers | `tests/frontend/LocalRuntimeBridge*.test.cjs` | [Local Runtime Process Lifecycle Change Workflow](../frontend/main/local_backend/process_lifecycle_change_workflow.md) |
| Local-runtime tool result failures | local-runtime executable registry/tool implementation backed by local-runtime Python modules | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/result.py`, concrete tool module | `tests/sidecar/test_tool_result.py`, tool-specific local-runtime Python tests | [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md) |
| SDK/main tool-dispatch failure and display projection | SDK tool coordinator plus renderer projection | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts` | SDK tool/runtime tests, `ChatStreamToolHandlers.test.ts` | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) |
| Renderer component crash boundary | Renderer components | `frontend/src/renderer/components/ErrorBoundary.jsx`, `frontend/src/renderer/styles/ErrorBoundary.css` | focused renderer component tests if behavior changes | [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md) |
| Provider/inference error mapping | Backend provider/inference layer | `backend/src/llm/providers/error_mapping.py`, `backend/src/core/inference/errors.py`, provider modules | provider/inference backend tests | [Provider Change Workflow](../providers/provider_change_workflow.md) |
| Secret-safe logging of errors | Producing runtime | backend logging, Electron logs, renderer logs, local-runtime logs | focused tests or fixture scans | [Observability Change Workflow](observability_change_workflow.md) |

## Failure Boundary Rules

- Backend should not expose stack traces or provider secrets over websocket/HTTP responses.
- Route validation errors should be actionable; unexpected internal errors should be sanitized.
- Electron bridge failures should preserve enough context for renderer recovery without pretending the backend or local runtime is healthy.
- Local-runtime tools should return `ToolResult(success=False, error=..., data={...})`, not arbitrary exception objects or mapping-shaped compatibility payloads.
- Renderer error UI should render canonical failure payloads and avoid swallowing producer evidence needed for debugging.
- Retry behavior must have a clear owner and termination condition.

## Runtime Error Contracts

### Backend websocket errors

Canonical websocket error envelope:

```json
{
  "type": "error",
  "id": "<original_message_id|null>",
  "payload": {
    "message": "<sanitized_text>"
  }
}
```

Use `send_error_response(...)` or the existing route helper path rather than constructing one-off error messages in handlers. Preserve `id` when a client message id exists so the renderer can route failure to the right pending operation.

### Backend HTTP errors

HTTP routes should raise `HTTPException` or route-owned error helpers with intentional status/detail. Keep route details useful for validation/auth/client mistakes, but sanitize internal/provider exceptions. If a route is public or SDK-facing, update SDK auth/error docs and client tests when status codes or payloads change.

### Electron main bridge errors

Electron main normalizes multiple failure classes:

- websocket disconnected query sends synthesize a backend-style `error` event.
- settings ACK timeouts resolve failure after the configured timeout.
- local-runtime JSON-RPC request failures return `{ success: false, error }`.
- local-runtime process failures broadcast `local-runtime-status` with `ready: false` and an error string.

Do not throw uncaught errors from these hot paths; preserve status updates and pending-promise cleanup.

### Local-runtime tool errors

Local-runtime tool execution should converge to `ToolResult`:

- missing tool -> `Tool not found: <name>`
- non-dict args -> `Tool args must be an object`
- non-`ToolResult` returns fail as `Tool returned invalid result format`
- unexpected exceptions are caught and wrapped as tool execution failures

Tool implementations should include structured `data.error_code` when a caller can programmatically recover.

### Renderer error surfaces

Renderer UI should display errors from canonical backend events, tool-result envelopes, local-runtime status payloads, or component crash boundaries. Avoid creating a second error vocabulary if a producing runtime already has a stable contract.

## Change Paths

### Change websocket error behavior

Read:

- [Handler Registry and Error Envelope Reference](../backend/api/handler_registry_and_error_envelope_reference.md)
- [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md)
- [Frontend IPC/WS Error Recovery Reference](../frontend/inventory/protocols/errors/frontend_ipc_ws_bridge_and_local_backend_error_recovery_contract_reference.md)

Edit:

- backend route message handling and sanitizer code for producer behavior.
- error formatter only when outbound `type="error"` payload changes.
- Electron bridge only if relay or synthetic query failure behavior changes.
- renderer stream consumers only after producer envelope shape is stable.

Validate:

- message id/context fields are preserved where expected.
- validation errors remain useful.
- unexpected errors sanitize client text and log server-side details.
- renderer routes error events to the right pending query/settings/tool state.

### Change HTTP error behavior

Read:

- [API Route Change Workflow](../backend/api/api_route_change_workflow.md)
- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md)

Edit the owning route/service first. Keep auth, validation, missing-resource, conflict, and internal errors distinct.

Validate:

- expected invalid payloads produce deterministic status codes.
- auth failures keep credential class separation.
- public SDK clients map status codes correctly.
- route docs/examples match new detail shape.

### Change Local-Runtime Tool Failure Behavior

Read:

- [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md)
- [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Edit:

- concrete local-runtime Python tool for domain-specific error codes and messages.
- `tools/result.py` only if the shared ToolResult contract changes.
- `tools/registry.py` only if result contract enforcement changes.
- Electron/renderer result handling only if bridge envelope changes.

Validate:

- missing tool, non-dict args, schema validation, expected runtime failure, and unexpected exception paths.
- non-`ToolResult` returns fail closed with the invalid-format error.
- backend receives a failure result that can unblock pending tool waits.

### Change Electron bridge or process failure behavior

Read:

- [Frontend IPC/WS Error Recovery Reference](../frontend/inventory/protocols/errors/frontend_ipc_ws_bridge_and_local_backend_error_recovery_contract_reference.md)
- [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md)
- [Process Health Checklist](process_health_checklist.md)

Edit:

- `ipc.cjs` for websocket send/close/reconnect and synthetic query failure.
- `ipc_settings_sync.cjs` for ACK timeout behavior.
- `local_runtime_bridge.cjs` for local-runtime process/request failures.
- `wakeword_bridge*.cjs` for wakeword process status failures.

Validate:

- pending requests are rejected or resolved exactly once.
- reconnect/close clears stale ACK state.
- process exit and spawn `ENOENT` status payloads stay actionable.
- renderer receives status changes without crashing.

### Change renderer error display

Read:

- [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Symptom Playbooks](symptom_playbooks.md)

Edit:

- renderer stream/tool consumers for canonical failure payload handling.
- `ErrorMessage.jsx` or SDK/local-runtime tool failure helpers for display logic.
- `ErrorBoundary.jsx` only for component tree crash isolation, not transport failures.

Validate:

- backend `error` events display with the right conversation/turn context.
- tool failures persist to transcript where expected.
- component crash fallback does not swallow transport failures.
- stale-turn errors do not update the active conversation.

### Change log sanitization or diagnostic detail

Read:

- [Observability Change Workflow](observability_change_workflow.md)
- [Credential and Token Change Workflow](../security/credential_token_change_workflow.md)
- [Logging](logging.md)

Edit the producing runtime call site first. Add broader helpers only when repeated sites need the same redaction behavior.

Validate:

- logs include correlation ids, provider/tool names, and status where useful.
- logs exclude bearer tokens, provider keys, OAuth tokens, raw auth-state JSON, and user-private local paths unless explicitly safe.
- client-visible errors stay sanitized even when debug flags are enabled.

## Debug Routing

| Symptom | First checks | Likely owner |
| --- | --- | --- |
| UI shows generic error but backend logs validation detail | websocket sanitizer and renderer display contract | backend API error mapping or renderer consumer |
| Query send fails while disconnected | synthetic query failure event and websocket bridge state | Electron main IPC bridge |
| Settings save spins then fails | ACK map, timeout, backend `settings-updated`/`error` id | Electron settings sync or backend handler |
| Tool call hangs after local-runtime tool failure | local-runtime Python `ToolResult`, Electron relay, backend result storage | local-runtime tool implementation or backend tool-result ingress |
| Tool failure visible but not saved in transcript | SDK runtime/store projection and structured failure contract | SDK runtime/store or renderer projection |
| Local-runtime startup times out | process spawn/path/readiness status | Electron local runtime bridge or packaged runtime |
| Provider exception leaks details | provider error mapping and sanitizer path | backend provider/inference layer |
| Error includes a token/key | producing log/response call site and redaction coverage | owner runtime plus security docs |

## Validation Matrix

| Changed failure boundary | Minimum focused validation |
| --- | --- |
| Backend websocket error envelope | backend API/websocket error tests plus formatter/schema tests |
| Backend HTTP route error | focused route tests for status/detail/auth/validation/internal errors |
| Backend exception hierarchy | `./scripts/python-in-env backend pytest tests/backend/test_exceptions.py tests/backend/test_api_errors.py` |
| Parser/tool-call recovery | parser validation and interaction-loop recovery tests |
| Tool result ingestion | `./scripts/python-in-env backend pytest tests/backend/test_tool_result_receiver.py tests/backend/test_tool_result_router.py tests/backend/test_incoming_tool_result_schemas.py` |
| Electron websocket/settings/local-runtime failures | `<windie> test frontend -- IpcMainBridge LocalRuntimeBridge` |
| Preload/IPC validation | `<windie> test frontend -- IpcBridgeValidation` |
| Local-runtime ToolResult/registry | `./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_tool_result.py tests/sidecar/test_tool_registry.py` |
| SDK tool execution failure and renderer persistence | `<windie> test frontend -- AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState ToolCallMessageState` |
| Docs-only error changes | `<windie> docs list`, `git diff --check`, and focused Markdown link check over touched docs |

## Review Checklist

Before committing an error/failure change:

1. Name the producing runtime.
2. Confirm whether the failure crosses websocket, HTTP, IPC, JSON-RPC, filesystem, or UI state.
3. Preserve canonical envelope/result shape unless the contract intentionally changes.
4. Add missing/invalid/expected-failure/unexpected-exception coverage for the changed boundary.
5. Confirm pending requests, tool waits, or ACK maps cannot hang forever.
6. Confirm secrets and stack traces are not exposed to renderer/user-facing payloads.
7. Update deep docs and this workflow when error payloads, status codes, or retry semantics change.

## Related Docs

- [Failure Domain Map](../architecture/failure_domain_map.md)
- [Handler Registry and Error Envelope Reference](../backend/api/handler_registry_and_error_envelope_reference.md)
- [Frontend IPC/WS Error Recovery Reference](../frontend/inventory/protocols/errors/frontend_ipc_ws_bridge_and_local_backend_error_recovery_contract_reference.md)
- [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Observability Change Workflow](observability_change_workflow.md)
- [Test Selection](test_selection.md)
