---
summary: "Backend agent docs sub-hub for session lifecycle/config propagation, interaction-loop state machine, and tool-turn orchestration internals."
read_when:
  - When changing `backend/src/agent/*` execution/session internals.
  - When debugging model-update propagation, loop termination behavior, or tool-turn cleanup leaks.
title: "Backend Agent Docs Hub"
---

# Backend Agent Docs Hub

## Deep Pages

- [Session Runtime and Config Rewire Reference](session_runtime_and_config_rewire_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)

## Code Scope

- `backend/src/agent/session/*`
- `backend/src/agent/execution/*`
- `backend/src/agent/llm/*`
- `backend/src/agent/history/*`
- `backend/src/agent/tools/*`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/orchestrator.py`
- `tests/backend/test_session_manager.py`
- `tests/backend/test_session_cleanup.py`
- `tests/backend/test_interaction_loop.py`
- `tests/backend/test_tool_sender.py`
- `tests/backend/test_bundle_execution.py`
