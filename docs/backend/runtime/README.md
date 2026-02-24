---
summary: "Backend runtime docs sub-hub for query stream pipeline, interaction-loop state machine, session lifecycle, and tool runtime behavior."
read_when:
  - When changing query loop behavior, session runtime state, or tool orchestration sequencing.
  - When debugging stream completion, cancellation, or iteration-limit behavior.
title: "Backend Runtime Docs Hub"
---

# Backend Runtime Docs Hub

## Deep Pages

- [Agent and Tool Runtime](AGENT_AND_TOOL_RUNTIME.md)
- [Session State and Lifecycle](SESSION_STATE_AND_LIFECYCLE.md)
- [Query Execution and Stream Pipeline Reference](QUERY_EXECUTION_AND_STREAM_PIPELINE_REFERENCE.md)

## Code Scope

- `backend/src/agent/execution/*`
- `backend/src/agent/session/*`
- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
