---
summary: "Backend waiting-router docs sub-hub for artifact-ref validation, screenshot decode/injection policy, and shared individual-vs-bundle route semantics."
read_when:
  - When changing `backend/src/agent/tools/waiting/router.py` route behavior or screenshot handling.
  - When debugging decoded screenshot misses, system-state precedence, or unresolved individual/bundle futures.
title: "Backend Waiting Router Docs Hub"
---

# Backend Waiting Router Docs Hub

## Deep Pages

- [Artifact Ref Validation and Shared Route-Result Semantics Reference](artifact_ref_validation_and_shared_route_result_semantics_reference.md)

## Related Pages

- [Backend Tools Waiting Docs Hub](../README.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](../tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](../tool_result_storage_future_lifecycle_and_cleanup_reference.md)

## Code Scope

- `backend/src/agent/tools/waiting/router.py`
- `tests/backend/test_tool_result_router.py`
