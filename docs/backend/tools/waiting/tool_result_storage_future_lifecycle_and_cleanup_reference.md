---
summary: "Deep reference for centralized ToolResultStorage behavior: pending/bundle maps, future creation and resolution in sync/async contexts, TTL cleanup rules, request-id targeted cleanup, and session-level clear semantics."
read_when:
  - When changing `ToolResultStorage` APIs or cleanup policy.
  - When debugging leaked result futures, stale pending results, or bundle wait deadlocks.
title: "Tool Result Storage Future Lifecycle and Cleanup Reference"
---

# Tool Result Storage Future Lifecycle and Cleanup Reference

## Canonical Modules

- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/processing/processor.py`
- `tests/backend/test_tool_result_storage.py`

## Storage Domains

`ToolResultStorage` maintains four primary maps:

- `_pending_results`: `request_id -> ToolResult`
- `_result_futures`: `request_id -> asyncio.Future`
- `_bundled_results`: `bundle_id -> ToolResult`
- `_bundle_futures`: `bundle_id -> asyncio.Future`

Plus TTL timestamp maps for result and bundle keys.

## Future Creation in Mixed Contexts

`_create_future()` supports both contexts:

- running async loop: use `get_running_loop().create_future()`
- sync/no-loop context: fallback to `get_event_loop()` or create/set new loop

This allows unit and runtime code to create futures safely in both async and sync call sites.

## Resolution and Timestamp Rules

Result future resolution (`resolve_result_future`):

- sets result when matching future exists and is not done
- removes future entry
- removes timestamp only if no pending result remains

Bundle equivalent (`resolve_bundle_future`) follows same pattern.

This prevents timestamp loss while corresponding result entries still exist.

## Cleanup APIs

### TTL cleanup (`cleanup_old_results`)

- default TTL from constructor (`cleanup_ttl_seconds`, default 300s)
- removes expired pending + future entries for both individual and bundle domains
- returns count of cleaned ids
- logs summary when cleanup removes anything

### Targeted request cleanup (`cleanup_request_ids`)

- removes pending result and future for each request id
- used by tool-result processing finally blocks to guarantee per-turn cleanup
- returns count of removed entries

### Global reset (`clear_all`)

- clears all result/future/timestamp maps
- used during session cleanup and teardown paths

## Router and Processor Integration

Router uses storage for ingress-time persistence + wake-up:

- stores inbound individual/bundle results
- resolves matching waiting futures

Processor uses storage for post-processing cleanup:

- `cleanup_request_ids` on all request ids seen in turn
- periodic `cleanup_old_results(max_age_seconds=300)` safety sweep

Together they provide bounded lifetime for tool-result state.

## Stats Surface

`get_stats()` returns map sizes for:

- pending results
- result futures
- bundled results
- bundle futures

Useful for diagnostics and leak detection in long-running sessions.

## Test-Backed Invariants

`tests/backend/test_tool_result_storage.py` validates:

- pending store/get/remove semantics
- individual and bundle future resolution removes futures
- TTL cleanup removes expired results and stale future-only entries
- targeted cleanup removes both pending and future entries
- future creation works in sync context
- clear-all resets all storage counts

## Drift Hotspots

1. changing timestamp removal behavior can cause premature or missed TTL cleanup.
2. breaking sync-context future creation can fail non-async initialization/tests.
3. removing targeted cleanup from processor paths can leak maps during failed turns.
4. changing cleanup return counts can invalidate diagnostics/tests that detect leak regression.

## Related Pages

- [Backend Tools Waiting Docs Hub](README.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
