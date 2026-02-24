---
summary: "Backend tools preparation docs sub-hub for screenshot/OCR state lifecycle, proactive OCR task coordination, and resolved tool-call storage contracts used by execution waits."
read_when:
  - When changing `backend/src/agent/tools/preparation/screenshot/*` or resolved-call storage behavior.
  - When debugging stale screenshot usage, OCR completion-event blocking, or missing resolved-call metadata during tool execution waits.
title: "Backend Tools Preparation Docs Hub"
---

# Backend Tools Preparation Docs Hub

## Deep Pages

- [Screenshot Manager and OCR Task Lifecycle Reference](screenshot_manager_and_ocr_task_lifecycle_reference.md)
- [Resolved Tool-Call Storage and Session Access Contract Reference](resolved_tool_call_storage_and_session_access_contract_reference.md)

## Related Pages

- [Backend Tools Docs Hub](../README.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Backend Tools Execution Docs Hub](../execution/README.md)

## Code Scope

- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/preparation/screenshot/processor.py`
- `backend/src/agent/tools/preparation/storage/resolved_call_storage.py`
- `backend/src/agent/session/session.py`
- `backend/src/tools/single_tool_execution.py`
- `tests/backend/test_screenshot_manager.py`
- `tests/backend/test_screenshot_state.py`
- `tests/backend/test_resolved_tool_call_storage.py`
- `tests/backend/test_single_tool_execution.py`
