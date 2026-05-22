---
summary: "End-to-end WindieOS tool execution lifecycle from backend schema exposure through SDK-runtime dispatch, sidecar execution, result ingress, history, and loop continuation."
read_when:
  - When changing tool-call dispatch, bundle execution, request ids, tool-result payloads, screenshots, or model-facing history.
  - When debugging a tool that was called by the model but did not execute or did not re-enter backend history correctly.
title: "Tool Execution Lifecycle"
---

# Tool Execution Lifecycle

WindieOS tools run through a distributed pipeline. The backend owns model-facing schema and loop semantics; the SDK runtime owns local dispatch, backend result return, normalized tool events, and display/rehydrate projections; the sidecar owns executable desktop actions.

## Lifecycle

1. Backend builds canonical tool specs from `backend/src/tools/tool_catalog.py`.
2. Backend `ToolPolicy` filters specs by interaction mode, agent profile, client capabilities, provider health, disabled tools, and dev selection.
3. Prompt construction includes the filtered model-facing tools.
4. The model emits one or more tool calls.
5. Backend parser/tool bridge normalizes provider-native calls into WindieOS tool-call shapes.
6. Backend preparation resolves any high-level or grounded fields into executable payloads.
7. Backend sends `tool-call` or `tool-bundle` websocket events to the frontend.
8. SDK runtime normalizes the tool event and routes the call through the local runtime adapter to the sidecar daemon/local executor.
9. Electron main invokes the Python sidecar daemon or JSON-RPC tool registry as the local executor.
10. Sidecar executes the local action and returns a normalized `ToolResult`.
11. SDK runtime sends `tool-result` or `tool-bundle-result` back to backend, appends a normalized `tool_output` or `tool_bundle_output` event with display content, and projects a display-only renderer `tool-output` event for both single calls and bundles. If backend delivery fails after local execution, the SDK stores that output as `success: false` with `deliveryFailed: true` and marks the turn failed.
12. Backend result receiver resolves the pending future.
13. Backend canonicalizes model-facing tool output into bounded `model_llm_content` while preserving full `display_content`, echoes the accepted canonical output as a backend `tool-output` event for storage, and commits the bounded model content to history.
14. Backend history committer writes tool rows and the interaction loop continues.

## Owner Map

| Stage | Owner | Primary files |
| --- | --- | --- |
| Tool catalog and schema build | Backend | `backend/src/tools/tool_catalog.py`, `backend/src/tools/registry.py`, `backend/src/tools/schema_registry.py`, `backend/src/tools/remote_tools/*` |
| Policy filtering | Backend | `backend/src/tools/tool_policy.py`, `backend/src/tools/agent_capability_policy.py`, `backend/src/tools/tool_selection.py`, `backend/src/tools/provider_health.py` |
| Provider call normalization | Backend | `backend/src/agent/execution/tool_call_bridge.py`, provider modules under `backend/src/llm/providers` |
| Preparation and coordinate resolution | Backend | `backend/src/agent/tools/preparation/**`, `backend/src/services/screen_grounding/**` |
| Frontend dispatch event | Backend API | `backend/src/api/processing/formatters/actions/*`, `backend/src/api/schemas/outgoing.py` |
| SDK runtime execution | SDK runtime and Electron main host | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `frontend/src/main/windie_sdk_runtime.cjs`, `frontend/src/main/ipc/ipc_sdk_command_router.cjs`, `frontend/src/main/ipc/ipc_sdk_tool_router.cjs` |
| Electron-sidecar bridge | Electron main | `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/sidecar_daemon_manager.cjs` |
| Local execution | Sidecar | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/**` |
| Result ingress | Backend API | `backend/src/api/handlers/tool_result.py`, `backend/src/agent/tools/waiting/**` |
| Result formatting/history | Backend agent | `backend/src/agent/tools/processing/**`, `backend/src/agent/history/**` |

## Request IDs and Bundles

Single-tool path:

- backend assigns or preserves a `request_id`
- SDK runtime returns `tool-result` with the same `request_id`
- Electron main's SDK tool router must not synthesize a backend wait id from
  `correlation_id`, `tool_call_id`, or the websocket event id. If `request_id`
  is missing, the event is malformed for result delivery and local execution is
  not claimed.
- failed SDK tool results keep `success: false`, include `error`, and still carry a model-facing `data.llm_content` string when available
- backend emits the accepted single-tool result back as `tool-output` with
  `display_content` for UI replay and `model_llm_content` for future model
  rehydrate. The legacy `output` field remains display-oriented for existing
  stream consumers. SDK projections prefer this backend event over the earlier
  local display event when both share the same request/tool-call identity.
- backend includes `llm_content_original_tokens`, `llm_content_token_limit`,
  `llm_content_truncated`, and `llm_content_token_source` on canonical
  single-tool outputs so debugging can distinguish LiteLLM-tokenizer truncation
  from fallback character estimates.
- backend waiting storage resolves the pending future for that request
- processing cleanup removes resolved-call state for the request

Bundle path:

- backend sends one `tool-bundle` event with a `bundle_id`
- SDK runtime executes bundle steps through the local runtime adapter and returns
  `tool-bundle-result`
- Electron main also emits one display-only renderer `tool-output` projection
  for the bundle result so users can inspect local output while the backend loop
  continues
- SDK bundle step statuses use `ok` and `error`; the top-level status is `success`, `partial_failure`, or `failure`
- backend treats atomic bundle success differently from individual fallback output
- partial failure must preserve enough per-step output for debugging and model recovery
- SDK rehydrate projection does not replay backend-internal bundle trace fields
  as top-level message keys. It keeps bundle metadata in `structured_payload`
  and emits one provider-safe tool replay row per completed step when
  `tool_call_id` values are available.
- SDK tool correlation helpers are the canonical client-side alias resolver for
  `request_id`, `tool_call_id`, `correlation_id`, `bundle_id`, and their
  camelCase SDK event equivalents. Runtime pending-tool state, display
  projections, rehydrate projections, and renderer display helpers consume
  those helpers instead of keeping separate backend event ID precedence tables.

If a tool hangs, inspect request-id state in this order:

1. backend emitted `tool-call` or `tool-bundle`
2. SDK runtime received and started it
3. sidecar executed or returned a validation/runtime error
4. SDK runtime sent result back with matching request or bundle id
5. backend waiting storage resolved and cleaned it
6. SDK normalized tool-output event was stored for display and future rehydrate projections

## Screenshots and Artifacts

Tool execution can produce image context in several ways:

- `screenshot` captures the desktop.
- `wait` captures a fresh screen after delay.
- mouse/keyboard/scroll actions may return post-action screenshots depending on executor behavior.
- browser screenshots come from dedicated browser runtime.
- SDK/main runtime may upload or preserve local image refs before returning a tool result.

Do not put large inline base64 payloads on hot JSON-RPC paths when a file ref or artifact ref is available. Keep artifact URL resolution in the frontend/backend endpoint stores rather than coupling display helpers to upload IPC.

## Failure Routing

| Failure | Likely owner | First docs |
| --- | --- | --- |
| Tool never appears in prompt | backend policy/profile/provider health | [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) |
| Model emits invalid args | backend schema, provider projection, parser recovery | [Tool Contracts](tool_contracts.md), [Backend Tools Docs Hub](../backend/tools/README.md) |
| Backend emits `tool-call`, local execution does nothing | SDK runtime event normalization, tool coordinator, or Electron main runtime host | [Windie Client Runtime](../sdk/windie_client_runtime.md) |
| Backend tool event is missing request or bundle ids | SDK runtime malformed-event handling | SDK should store `runtime_error` with `reason: "malformed_tool_event"` and avoid invoking the sidecar without a result id |
| SDK runtime invokes tool but sidecar says missing tool | sidecar registry/exposed-name parity | [Tool Catalog Matrix](tool_catalog_matrix.md), [Sidecar Registry](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md) |
| Sidecar succeeds but model never sees result | result envelope/request id/waiting storage | [Backend Tool Result Ingress](../backend/tools/tool_result_ingress_and_storage_reference.md) |
| Local tool output is stored as `deliveryFailed` | SDK transport/result delivery | SDK runtime should also append a turn error so UI/debug state does not treat the tool wait as completed successfully |
| Tool output appears in UI but rehydrate breaks later | transcript/history shaping | [Memory Hub](../memory/README.md), [Backend History](../backend/agent/history/README.md) |

## Validation Checklist

For tool execution changes:

1. Backend schema/policy tests cover tool visibility and args.
2. Backend formatter/outgoing schema tests cover `tool-call`, `tool-bundle`, and result events.
3. SDK/frontend tests cover tool coordinator correlation and result relay.
4. Sidecar tests cover executable behavior and `ToolResult` normalization.
5. Bundle tests cover success, failure, timeout, and cleanup paths.
6. Rehydrate/transcript tests cover any visible or model-facing row shape changes.
