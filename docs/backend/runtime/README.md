---
summary: "Backend runtime docs sub-hub for query stream pipeline, interaction-loop state machine, session lifecycle, and tool runtime behavior."
read_when:
  - When changing query loop behavior, session runtime state, or tool orchestration sequencing.
  - When debugging stream completion, cancellation, or iteration-limit behavior.
title: "Backend Runtime Docs Hub"
---

# Backend Runtime Docs Hub

## Deep Pages

- [Agent and Tool Runtime](agent_and_tool_runtime.md)
- [Session State and Lifecycle](session_state_and_lifecycle.md)
- [Query Execution and Stream Pipeline Reference](query_execution_and_stream_pipeline_reference.md)
- [Token Count Event and Usage Diagnostics Reference](token_count_event_and_usage_diagnostics_reference.md)

## Code Scope

- `backend/src/agent/execution/*`
- `backend/src/agent/session/*`
- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
