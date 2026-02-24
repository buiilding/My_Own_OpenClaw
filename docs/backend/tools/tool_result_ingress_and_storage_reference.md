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

Session delegation:

- `session.process_frontend_tool_result(...)`
- `session.process_frontend_tool_bundle_result(...)`

Session does not parse payload in these methods; it forwards to session-level waiting handler.

## Session-Level Waiting Components

Initialized via `init_tool_result_handler(session)`:

1. `ToolResultReceiver`
2. `ScreenshotProcessor`
3. `ToolResultRouter`
4. session-level `ToolResultHandler` (waiting facade)

Division of responsibilities:

- receiver: convert frontend payloads to canonical `ToolResult`
- router: screenshot/system-state extraction + storage/future resolution
- storage: pending result maps + futures + bundle maps + cleanup

## Normalization and Routing Rules

### Individual result

`process_frontend_tool_result(request_id, success, result_data, error)`:

1. receiver creates `ToolResult.from_dict(...)`
2. router updates session system-state if present
3. router extracts screenshot bytes if present
4. if only `screenshot_ref` exists, router attempts artifact load (`ArtifactStore.load_base64`)
5. router stores result under request ID
6. router resolves waiting request future when present

### Bundle result

`process_frontend_tool_bundle_result(bundle_id, status, step_results, ...)`:

1. receiver normalizes each step result
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
- both arrival orders are supported:
- result arrives before future
- future exists before result
- cleanup methods support per-ID removal and TTL sweeps

## Wait Semantics in Orchestrator

### Single-tool wait (`execute_single_tool`)

- request ID read from tool metadata
- creates future first (race prevention)
- checks already-stored result and resolves immediately if present
- otherwise waits up to 120s
- always removes future in `finally`

Special safety guard:

- if resolved coordinates were computed from stale screenshot ID, returns immediate safety failure result

### Bundle wait (`execute_bundle`)

- creates bundle future
- checks already-stored bundle result first
- otherwise waits up to 120s for one bundle result
- removes bundle future in `finally`
- expands bundle step outputs back into per-tool `ToolExecutionBatch` entries for compatibility

## Send-Side Coupling (Why Some Results Pre-Exist)

`ToolSender` can pre-store synthetic results before frontend execution:

- coordinate-resolution failures create synthetic result and store pending by request ID
- failed atomic bundle preparation stores synthetic bundled result and resolves bundle future if waiting

This allows orchestrator wait paths to complete immediately without frontend round-trip in failure scenarios.

## Debug Checklist

If tool waits hang:

1. verify request/bundle IDs match between emitted tool-call/tool-bundle and returned result payload
2. verify router executed and stored result before timeout
3. inspect whether stale-turn cancellation from frontend produced explicit failure payload

If screenshot missing in backend result:

1. verify payload includes `screenshot` or `screenshot_ref`
2. if only `screenshot_ref`, verify artifact file exists and ID pattern matches loader expectations
3. inspect router warnings for artifact load failures

If bundle processing mismatches tool count/order:

1. verify frontend step_results ordering matches original parsed tool-call order
2. inspect bundle expansion path in `execute_bundle` for fallback error generation
3. verify bundle status/error fields are present in `tool-bundle-result`

## Related Pages

- [Backend Tools Waiting Docs Hub](waiting/README.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](waiting/tool_result_storage_future_lifecycle_and_cleanup_reference.md)
