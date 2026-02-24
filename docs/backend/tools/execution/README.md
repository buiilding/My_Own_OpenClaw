---
summary: "Backend tools execution docs sub-hub for send/wait orchestration, atomic bundle detection rules, and per-tool future wait semantics."
read_when:
  - When changing `backend/src/agent/tools/sending/*`, `backend/src/agent/tools/orchestrator.py`, or `backend/src/tools/{orchestrator,single_tool_execution,bundle_execution}.py`.
  - When debugging missing tool-call dispatch events, bundle-vs-single execution routing, or tool-result wait timeouts.
title: "Backend Tools Execution Docs Hub"
---

# Backend Tools Execution Docs Hub

## Deep Pages

- [Backend Tool Sender Docs Hub](sender/README.md)
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Request-ID Extraction and Failed-Bundle Storage Reference](sender/request_id_extraction_and_failed_bundle_result_storage_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)

## Related Pages

- [Backend Tools Docs Hub](../README.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Backend Tools Waiting Docs Hub](../waiting/README.md)

## Code Scope

- `backend/src/agent/tools/orchestrator.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/shared/bundle_detection.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `tests/backend/test_tool_sender.py`
- `tests/backend/test_tool_result_orchestrator.py`
- `tests/backend/test_bundle_detection.py`
- `tests/backend/test_bundle_execution.py`
