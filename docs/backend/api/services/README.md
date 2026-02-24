---
summary: "Backend API services docs sub-hub for query orchestration, transcript rehydrate normalization, wakeword activation flow, and shared API-layer TTS session lifecycle boundaries."
read_when:
  - When changing `backend/src/api/services/*` modules.
  - When debugging handler-to-service ownership boundaries across query, rehydrate, and wakeword message paths.
title: "Backend API Services Docs Hub"
---

# Backend API Services Docs Hub

## Deep Pages

- [Query Execution Service Stream Context and Completion Fallback Reference](query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)

## Related Pages

- [Backend API Docs Hub](../README.md)
- [Backend API Handlers Docs Hub](../handlers/README.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](../processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)

## Code Scope

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/tts_session.py`
- `tests/backend/test_api_handlers.py`
