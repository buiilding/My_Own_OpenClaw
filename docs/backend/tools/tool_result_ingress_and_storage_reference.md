---
summary: "Detailed backend tool-result ingress reference: websocket handler delegation, session routing, screenshot/system-state normalization, future resolution, and bundle wait semantics."
read_when:
  - When changing tool-result or tool-bundle-result payload handling across API/session/runtime boundaries.
  - When debugging stuck tool waits, stale futures, screenshot artifact hydration, or bundle timeout behavior.
title: "Tool Result Ingress and Storage Reference"
---

# Tool Result Ingress and Storage Reference

## Canonical Modules

- `backend/src/api/handlers/tool_result.py`
- `backend/src/api/schemas/incoming.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/agent/tools/waiting/handler.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/agent/tools/sending/sender.py`

## Ingress Path (WebSocket -> Session)

`ToolResultHandler` in API layer accepts:

- `tool-result`
- `tool-bundle-result`

API handler responsibilities:

- validate typed payload shape
- normalize `data` and `step_results` into plain dict/list structures
- resolve active `AgentSession` via `SessionManager`
- delegate to session methods only
- build any backend canonical `tool-output` response envelope from resolved session/runtime context, not from the inbound result's `session_id`, `conversation_ref`, or `turn_ref`

Incoming schema nuance (`api/schemas/incoming.py`):

- `tool-result.payload.data` uses `ToolResultData` with `extra="allow"`:
  - shared typed keys (`output`, `system_state`, `screenshot`, `screenshot_ref`, `capture_meta`) are first-class
  - additional keys (for example renderer `system_state_internal`) are accepted and forwarded
- `tool-bundle-result.payload.error` is nullable and may be `null` in non-failure bundle paths

Session delegation (method names retain their historical `frontend` spelling as
the current compatibility surface):

- `session.process_local_tool_result(...)`
- `session.process_local_tool_bundle_result(...)`

Canonical echo context:

- successful single-result processing may return a backend canonical model-output result
- the canonical echo reuses `user_id` from the authenticated websocket context
- `session_id`, `conversation_ref`, and `turn_ref` come from the resolved session runtime
- client-supplied context fields on the inbound `tool-result` are ignored for this canonical echo so a stale local-runtime envelope cannot route backend-owned output into the wrong conversation or turn

Session does not parse payload in these methods; it forwards to session-level waiting handler.

## Session-Level Waiting Components

Initialized via `init_tool_result_handler(session)`:

1. `ToolResultReceiver`
2. `ScreenshotProcessor`
3. `ToolResultRouter`
4. session-level `ToolResultHandler` (waiting facade)

Division of responsibilities:

- receiver: convert SDK-submitted local-runtime payloads to canonical `ToolResult`
- router: screenshot/system-state extraction + storage/future resolution
- storage: pending result maps + futures + bundle maps + cleanup

## Normalization and Routing Rules

### Individual result

`process_local_tool_result(request_id, success, result_data, error)`:

1. receiver creates `ToolResult.from_payload(...)` from the SDK-submitted
   local-runtime result payload
2. router updates session system-state if present:
   - `system_state_internal` is authoritative when the key is present
   - invalid `system_state_internal` payloads are ignored instead of repaired
     from `system_state`
   - `system_state` updates session state only when `system_state_internal` is absent
3. router extracts screenshot bytes if present
4. if only `screenshot_ref` exists, router attempts artifact load (`ArtifactStore.load_base64`) only when ref passes artifact-id heuristic (`.png/.jpg/.jpeg`, short token, no path separator)
5. router stores result under request ID
6. router resolves waiting request future when present

### Bundle result

`process_local_tool_bundle_result(bundle_id, status, step_results, ...)`:

1. receiver normalizes each SDK/local-runtime step result
2. receiver creates one bundle `ToolResult` with metadata (`is_bundled`, `bundle_id`)
3. router processes screenshot/system-state path
4. router stores bundle result
5. router resolves waiting bundle future

## Storage Model (`ToolResultStorage`)

State partitions:

- `_pending_results`: request_id -> ToolResult
- `_result_futures`: request_id -> Future
- `_bundled_results`: bundle_id -> ToolResult
- `_bundle_futures`: bundle_id -> Future
- timestamp maps for TTL cleanup

Important behavior:

- future creation works in running-loop and non-running-loop contexts
- duplicate future creation for the same pending request or bundle id returns the existing future instead of replacing it
- both arrival orders are supported:
- result arrives before future
- future exists before result
- cleanup methods support per-ID removal and TTL sweeps

## Wait Semantics in Orchestrator

### Single-tool wait (`execute_single_tool`)

- request ID read from tool metadata
- missing request ID returns an invalid-tool-call failure result before any
  future is created
- creates future first (race prevention)
- checks already-stored result and resolves immediately if present
- otherwise waits up to 120s
- always removes future in `finally`

Special safety guard:

- if resolved coordinates were computed from stale screenshot ID, returns immediate safety failure result
- if resolved-call storage returns a malformed value, returns immediate failure
  instead of falling back to the original parsed tool arguments

### Bundle wait (`execute_bundle`)

- creates bundle future
- checks already-stored bundle result first
- otherwise waits up to 120s for one bundle result
- removes bundle future in `finally`
- expands bundle step outputs back into per-tool `ToolExecutionBatch` entries for compatibility

Bundle-status reminder:

- local runtime can return `status="partial_failure"` with `error=null`
- backend bundle success is computed from both:
  - `status == "success"`
  - every step `status == "ok"`

## Send-Side Coupling (Why Some Results Pre-Exist)

`ToolSender` can pre-store synthetic results before SDK/main local-runtime dispatch:

- coordinate-resolution failures create synthetic result and store pending by request ID
- failed atomic bundle preparation stores synthetic bundled result and resolves bundle future if waiting

This allows orchestrator wait paths to complete immediately without a local-runtime round trip in failure scenarios.

## Debug Checklist

If tool waits hang:

1. verify request/bundle IDs match between emitted tool-call/tool-bundle and returned result payload
2. verify router executed and stored result before timeout
3. inspect whether stale-turn cancellation from SDK/main produced explicit failure payload

If screenshot missing in backend result:

1. verify payload includes `screenshot` or `screenshot_ref`
2. if only `screenshot_ref`, verify artifact file exists and ID pattern matches loader expectations
3. inspect router warnings for artifact load failures

If bundle processing mismatches tool count/order:

1. verify local-runtime step_results ordering matches original parsed tool-call order
2. inspect bundle expansion path in `execute_bundle` for fallback error generation
3. verify bundle status/error fields are present in `tool-bundle-result`

## Related Pages

- [Backend Tools Execution Docs Hub](execution/README.md)
- [Tool Sender Local-Runtime Dispatch and Synthetic Error Result Reference](execution/tool_sender_local_runtime_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Backend Tools Processing Docs Hub](processing/README.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](processing/tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Backend Tools Waiting Docs Hub](waiting/README.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](waiting/tool_result_storage_future_lifecycle_and_cleanup_reference.md)
