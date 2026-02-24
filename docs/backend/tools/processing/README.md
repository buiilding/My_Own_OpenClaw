---
summary: "Backend tools processing docs sub-hub for tool-result transform/format contracts, bundle-history composition behavior, and request-id cleanup guarantees after processing."
read_when:
  - When changing `backend/src/agent/tools/processing/*` or `backend/src/agent/tools/shared/bundle_result_formatter.py`.
  - When debugging malformed history tool-output text, missing screenshots in history rows, or leaked request-id/resolved-call state after processing.
title: "Backend Tools Processing Docs Hub"
---

# Backend Tools Processing Docs Hub

## Deep Pages

- [Tool Result Processor Bundle Formatting and Cleanup Reference](tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Result Transformer and Tool Result Formatting Contract Reference](result_transformer_and_tool_result_formatting_contract_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)

## Related Pages

- [Backend Tools Docs Hub](../README.md)
- [Backend Agent History Committer and Result-Processor Boundary Reference](../../agent/history/history_committer_and_result_processor_boundary_reference.md)
- [Backend Tools Execution Docs Hub](../execution/README.md)
- [Backend Tools Waiting Docs Hub](../waiting/README.md)
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](../execution/tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)

## Code Scope

- `backend/src/agent/tools/processing/coordinator.py`
- `backend/src/agent/tools/processing/processor.py`
- `backend/src/agent/tools/processing/transformer.py`
- `backend/src/agent/tools/processing/synthetic_factory.py`
- `backend/src/agent/tools/shared/bundle_result_formatter.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/core/interfaces/tool.py`
- `tests/backend/test_bundle_result_formatter.py`
- `tests/backend/test_tool_result_formatting.py`
- `tests/backend/test_tool_sender.py`
