---
summary: "Backend tools waiting docs sub-hub for frontend tool-result receive/route internals, screenshot artifact resolution, and pending/future storage cleanup semantics."
read_when:
  - When changing `backend/src/agent/tools/waiting/*` modules.
  - When debugging unresolved tool-result futures, bundle wait mismatches, or screenshot-ref decode behavior in tool-result routing.
title: "Backend Tools Waiting Docs Hub"
---

# Backend Tools Waiting Docs Hub

## Deep Pages

- [Tool Result Receiver and Router Shared Route-Mode Reference](tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](tool_result_storage_future_lifecycle_and_cleanup_reference.md)
- [Backend Waiting Router Docs Hub](router/README.md)
- [Artifact Ref Validation and Shared Route-Result Semantics Reference](router/artifact_ref_validation_and_shared_route_result_semantics_reference.md)

## Related Pages

- [Backend Tools Docs Hub](../README.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Backend API Handlers Docs Hub](../../api/handlers/README.md)
- [Backend Agent History Docs Hub](../../agent/history/README.md)

## Code Scope

- `backend/src/agent/tools/waiting/handler.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `tests/backend/test_tool_result_handler.py`
- `tests/backend/test_tool_result_receiver.py`
- `tests/backend/test_tool_result_router.py`
- `tests/backend/test_tool_result_storage.py`
