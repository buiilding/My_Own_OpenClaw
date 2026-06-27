---
summary: "Backend API handlers docs sub-hub for typed message dispatch, query execution lifecycle, non-query control handlers, and payload normalization boundaries."
read_when:
  - When changing `backend/src/api/handlers/*` or `backend/src/api/services/query_execution.py`.
  - When debugging websocket message handling differences across query, stop-query, settings, rehydrate, wakeword, and tool-result flows.
title: "Backend API Handlers Docs Hub"
---

# Backend API Handlers Docs Hub

## Deep Pages

- [Query Handler and Query Execution Service Runtime Reference](query_handler_and_query_execution_service_runtime_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](non_query_handler_dispatch_and_payload_normalization_reference.md)

## Related Pages

- [Backend API Docs Hub](../README.md)
- [Backend API Services Docs Hub](../services/README.md)
- [Handler Behavior Matrix](../handler_behavior_matrix.md)
- [WebSocket Connection and Task Lifecycle Reference](../websocket_connection_and_task_lifecycle_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](../processing/stream_pipeline_completion_and_tts_concurrency_reference.md)

## Code Scope

- `backend/src/api/handlers/*`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/infrastructure/handler.py`
- `backend/src/api/infrastructure/errors.py`
- `tests/backend/test_api_handlers.py`
