---
summary: "Backend runtime docs sub-hub for query stream pipeline, interaction-loop state machine, session lifecycle, and tool runtime behavior."
read_when:
  - When changing query loop behavior, session runtime state, or tool orchestration sequencing.
  - When debugging stream completion, cancellation, or iteration-limit behavior.
title: "Backend Runtime Docs Hub"
---

# Backend Runtime Docs Hub

## Deep Pages

- [Agent Docs Hub](../agent/README.md)
- [Agent and Tool Runtime](agent_and_tool_runtime.md)
- [Session State and Lifecycle](session_state_and_lifecycle.md)
- [Session Runtime and Config Rewire Reference](../agent/session_runtime_and_config_rewire_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../agent/interaction_loop_and_tool_turn_orchestration_reference.md)
- [Query Execution and Stream Pipeline Reference](query_execution_and_stream_pipeline_reference.md)
- [Conversation History and Prompt Context Runtime Reference](conversation_history_and_prompt_context_runtime_reference.md)
- [Token Count Event and Usage Diagnostics Reference](token_count_event_and_usage_diagnostics_reference.md)

## Code Scope

- `backend/src/agent/execution/*`
- `backend/src/agent/session/*`
- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
