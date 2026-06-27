---
summary: "End-to-end tool execution lifecycle from backend schema exposure through SDK-runtime dispatch, local execution, result ingress, history, loop continuation, and removed ToolRunnerHook callback/turn-guard test routing."
read_when:
  - When changing tool-call dispatch, bundle execution, request ids, tool-result payloads, screenshots, or model-facing history.
  - When debugging a tool that was called by the model but did not execute or did not re-enter backend history correctly.
  - When resolving stale references to the removed `packages/windie-sdk-js/cjs/tools/ElectronToolEventRouter.js` artifact or Electron tool event router behavior.
  - When resolving stale references to removed `ToolRunnerHook.callbacks.test.ts` or `ToolRunnerHook.turnGuards.test.ts`; current local-tool result routing lives in SDK `ToolExecutionCoordinator` plus renderer projection tests.
title: "Tool Execution Lifecycle"
---

# Tool Execution Lifecycle

Tool execution runs through a distributed pipeline. The backend owns model-facing schema and loop semantics; the SDK runtime owns local dispatch, backend result return, normalized tool events, and display/rehydrate projections; the local runtime owns executable desktop actions through the local-runtime Python implementation.

The SDK tool execution source of truth is
`packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, called from the
Agent SDK conversation runtime. The generated CommonJS package output is built
from TypeScript; the removed
`packages/windie-sdk-js/cjs/tools/ElectronToolEventRouter.js` artifact is not a
current boundary and should not be reintroduced as a parallel Electron tool
event router.

## Lifecycle

1. Backend builds canonical tool specs from `backend/src/tools/tool_catalog.py`.
2. Backend `ToolPolicy` filters specs by interaction mode, agent profile, client capabilities, provider health, disabled tools, and agent capability policy.
3. Prompt construction includes the filtered model-facing tools.
4. The model emits one or more tool calls.
5. Backend parser/tool bridge normalizes provider-native calls into canonical tool-call shapes.
6. Backend preparation resolves any high-level or grounded fields into executable payloads.
7. Backend sends `tool-call` or `tool-bundle` websocket events to the SDK client.
8. SDK runtime normalizes the tool event and routes the call through its local runtime client to the configured local executor.
9. The local runtime invokes the local-runtime Python executor or JSON-RPC tool registry behind that local-executor boundary.
10. The local-runtime Python executor runs the local action and returns a normalized `ToolResult`.
11. SDK runtime sends `tool-result` or `tool-bundle-result` back to backend, appends a normalized `tool_output` or `tool_bundle_output` event with display content, and projects a display-only renderer `tool-output` event for both single calls and bundles. If backend delivery fails after local execution, the SDK stores that output as `success: false` with `deliveryFailed: true` and marks the turn failed.
12. Backend result receiver resolves the pending future.
13. Backend reads raw `data.output`, truncates that raw text only as needed for
    model history, preserves screenshot fields as multimodal history image
    context, and does not echo accepted local results as backend `tool-output`
    UI events.
14. Backend history committer writes tool rows containing the text output and
    screenshot image context, then the interaction loop continues.

## Owner Map

| Stage | Owner | Primary files |
| --- | --- | --- |
| Tool catalog and schema build | Backend | `backend/src/tools/tool_catalog.py`, `backend/src/tools/registry.py`, `backend/src/tools/schema_registry.py`, `backend/src/tools/remote_tools/*` |
| Policy filtering | Backend | `backend/src/tools/tool_policy.py`, `backend/src/tools/agent_capability_policy.py`, `backend/src/tools/tool_selection.py`, `backend/src/tools/provider_health.py` |
| Provider call normalization | Backend | `backend/src/agent/execution/tool_call_bridge.py`, provider modules under `backend/src/llm/providers` |
| Preparation and coordinate resolution | Backend | `backend/src/agent/tools/preparation/**`, `backend/src/services/screen_grounding/**` |
| Local-runtime dispatch event | Backend API | `backend/src/api/processing/formatters/actions/*`, `backend/src/api/schemas/outgoing.py` |
| SDK runtime execution | SDK runtime | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts` |
| Electron host bridge | Electron main | `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs` |
| Local execution | Local runtime, currently backed by local-runtime Python tool implementations | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/**` |
| Result ingress | Backend API | `backend/src/api/handlers/tool_result.py`, `backend/src/agent/tools/waiting/**` |
| Result formatting/history | Backend agent | `backend/src/agent/tools/processing/**`, `backend/src/agent/history/**` |

## Request IDs and Bundles

Single-tool path:

- backend assigns or preserves a `request_id`
- SDK runtime returns `tool-result` with the same `request_id`
- The Agent SDK tool coordinator must not synthesize a backend wait id from
  `correlation_id`, `tool_call_id`, or the websocket event id. If `request_id`
  is missing, the event is malformed for result delivery and local execution is
  not claimed.
- Backend stream `event_id` identifies the transport event row only. It is not
  the tool-call correlation id. SDK local-runtime outputs use SDK-owned local event
  ids such as `{turnRef}-local-tool-output-{requestId}` and link back to the
  backend call through `request_id`, provider `tool_call_id`, `correlation_id`,
  or `bundle_id`.
- failed SDK tool results keep `success: false`, include `error`, and carry raw
  failure text in `data.output` when available.
- backend does not emit accepted local SDK results back as `tool-output`.
  The SDK local execution path owns the UI row for local results; backend
  result ingress consumes `data.output` plus screenshot fields for
  waiting/model-history only.
- backend history projection may truncate raw `data.output` before the next
  model call, but it must not rewrite local result data into duplicate
  display/model text fields.
- backend waiting storage resolves the pending future for that request
- processing cleanup removes resolved-call state for the request

Bundle path:

- backend sends one `tool-bundle` event with a `bundle_id`
- SDK runtime executes bundle steps through the local runtime adapter and returns
  `tool-bundle-result`
- SDK display projections emit one display row for the bundle result so users
  can inspect local output while the backend loop continues
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
3. local executor ran or returned a validation/runtime error
4. SDK runtime sent result back with matching request or bundle id
5. backend waiting storage resolved and cleaned it
6. SDK normalized tool-output event was stored for display and future rehydrate projections

## Screenshots and Artifacts

Tool execution can produce image context in several ways:

- `screenshot` captures the desktop.
- `wait` captures a fresh screen after delay.
- mouse/keyboard/scroll actions may return post-action screenshots depending on executor behavior.
- browser screenshots come from dedicated browser runtime.
- SDK/main local-runtime dispatch may upload or preserve local image refs before returning a tool result.
- The local-runtime screenshot tool returns inline JPEG base64 in `data.screenshot`;
  the SDK local tool-output event hoists screenshot fields from `data` onto the
  event payload for display rows.
- The same SDK `tool-result` payload sends `data.screenshot` and
  `data.screenshot_content_type` to backend. Backend result processing attaches
  that screenshot to the canonical tool history row as model-visible multimodal
  image context while keeping UI display owned by the SDK local output event.

Prefer file or artifact refs for large binary payloads when the runtime has a
stable materialization path. The local-runtime screenshot tool is the current explicit
exception: it returns inline JPEG base64 so SDK-owned local output display works
without reviving the old Electron-only screenshot materializer.

## Failure Routing

| Failure | Likely owner | First docs |
| --- | --- | --- |
| Tool never appears in prompt | backend policy/profile/provider health | [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md) |
| Model emits invalid args | backend schema, provider projection, parser recovery | [Tool Contracts](tool_contracts.md), Backend Tools Docs Hub (private backend docs) |
| Backend emits `tool-call`, local execution does nothing | SDK runtime event normalization, tool coordinator, or SDK local-runtime client | [Windie Client Runtime](../sdk/windie_client_runtime.md) |
| Backend tool event is missing request or bundle ids | SDK runtime malformed-event handling | SDK should store `runtime_error` with `reason: "malformed_tool_event"` and avoid invoking the local executor without a result id |
| SDK runtime invokes tool but local runtime says missing tool | Local-runtime registry/exposed-name parity backed by local-runtime Python implementation | [Tool Catalog Matrix](tool_catalog_matrix.md), [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md) |
| Local execution succeeds but model never sees result | result envelope/request id/waiting storage | Backend Tool Result Ingress (private backend docs) |
| Local tool output is stored as `deliveryFailed` | SDK transport/result delivery | SDK runtime should also append a turn error so UI/debug state does not treat the tool wait as completed successfully |
| Tool output appears in UI but rehydrate breaks later | transcript/history shaping | [Memory Hub](../memory/README.md), Backend History (private backend docs) |

## Validation Checklist

For tool execution changes:

1. Backend schema/policy tests cover tool visibility and args.
2. Backend formatter/outgoing schema tests cover `tool-call`, `tool-bundle`, and result events.
3. SDK/main tests cover tool coordinator correlation and result relay.
4. Local-runtime Python tests cover executable behavior and `ToolResult` normalization.
5. Bundle tests cover success, failure, timeout, and cleanup paths.
6. Rehydrate/transcript tests cover any visible or model-facing row shape changes.

## Evidence Notes

- A tool turn is not verified until the request leaves backend orchestration,
  executes or fails in the owning runtime, and re-enters backend history.
- For bundles, capture both aggregate result evidence and per-child result
  evidence so partial failures do not masquerade as success.
