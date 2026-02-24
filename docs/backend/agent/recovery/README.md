---
summary: "Backend agent recovery docs sub-hub for interaction-loop recoverable tool-call error handling, synthetic tool-output replay semantics, and parser-recovery policy boundaries."
read_when:
  - When changing interaction-loop error handling paths or synthetic ToolCallEvent/ToolOutputEvent emission behavior.
  - When debugging malformed model tool-call payload failures, loop abort-vs-recover decisions, or tool-result cleanup guarantees.
title: "Backend Agent Recovery Docs Hub"
---

# Backend Agent Recovery Docs Hub

## Deep Pages

- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)

## Related Pages

- [Backend Agent Docs Hub](../README.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
- [Frontend Events Contracts Docs Hub](../../../frontend/contracts/events/README.md)

## Code Scope

- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/policies.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `tests/backend/test_interaction_loop.py`
