---
summary: "Backend tool-sender docs sub-hub for execution-ref extraction, synthetic failure emission, and bundle-failure storage/resolve semantics."
read_when:
  - When changing `backend/src/agent/tools/sending/sender.py` or execution-ref metadata contracts.
  - When debugging missing request IDs, skipped frontend tool dispatch, or bundle preparation failure handling.
title: "Backend Tool Sender Docs Hub"
---

# Backend Tool Sender Docs Hub

## Deep Pages

- [Request-ID Extraction and Failed-Bundle Storage Reference](request_id_extraction_and_failed_bundle_result_storage_reference.md)

## Related Pages

- [Backend Tools Execution Docs Hub](../README.md)
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](../tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Backend Tools Waiting Docs Hub](../../waiting/README.md)

## Code Scope

- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/preparation/types/execution_ref.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `tests/backend/test_tool_sender.py`
