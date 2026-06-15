---
summary: "Backend API processing completion docs sub-hub for query-execution helper contracts, event extraction, and completion backfill emission rules."
read_when:
  - When changing helper methods in `backend/src/api/services/query_execution.py`.
  - When debugging mixed dict/dataclass stream event handling or terminal completion synthesis.
title: "API Processing Completion Docs Hub"
---

# API Processing Completion Docs Hub

## Deep Pages

- [Query Execution Helper Contracts and Event Extraction Reference](query_execution_helper_contracts_and_event_extraction_reference.md)

## Related Pages

- [Backend API Processing Docs Hub](../README.md)
- [Query Execution Runtime-State and Completion Resolver Reference](../query_execution_runtime_state_and_completion_resolver_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](../stream_pipeline_completion_and_tts_concurrency_reference.md)

## Code Scope

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
- `backend/src/api/processing/pipeline.py`
- `tests/backend/test_stream_pipeline.py`
- `tests/backend/test_query_execution_service_helpers.py`
