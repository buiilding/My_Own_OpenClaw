---
summary: "Backend API processing docs sub-hub for formatter dispatch contracts, stream pipeline ordering, completion fallback logic, and TTS concurrency behavior."
read_when:
  - When changing `backend/src/api/processing/*` formatter or stream pipeline code.
  - When debugging missing streamed events, schema drift, or TTS race conditions.
title: "Backend API Processing Docs Hub"
---

# Backend API Processing Docs Hub

## Deep Pages

- [Formatter Dispatch and Schema Alignment Reference](formatter_dispatch_and_schema_alignment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](query_execution_runtime_state_and_completion_resolver_reference.md)

## Code Scope

- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatters/*`
- `backend/src/api/processing/tts/*`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/outgoing.py`
