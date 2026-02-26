---
summary: "Backend protocol compatibility sub-hub for legacy schema import stability, typed/dict formatter coexistence, stream payload normalization fallbacks, and incoming-union extraction tolerance."
read_when:
  - When changing backend websocket event shape handling across typed and dict payload producers.
  - When changing schema import paths, query extraction fallback fields, or route-table type extraction behavior that must preserve compatibility.
title: "Backend Protocol Compatibility Hub"
---

# Backend Protocol Compatibility Hub

## Deep Pages

- [Backend Protocol Backward Compatibility and Normalization Reference](backend_protocol_backward_compatibility_and_normalization_reference.md)

## Related Pages

- [Backend Inventory Protocols Hub](../README.md)
- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `backend/src/api/schema.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/core/container/incoming_routing.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_incoming_routing.py`
