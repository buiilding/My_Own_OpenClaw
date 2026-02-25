---
summary: "Backend agent docs sub-hub for session lifecycle/config propagation, interaction-loop state machine, and tool-turn orchestration internals."
read_when:
  - When changing `backend/src/agent/*` execution/session internals.
  - When debugging model-update propagation, loop termination behavior, or tool-turn cleanup leaks.
title: "Backend Agent Docs Hub"
---

# Backend Agent Docs Hub

## Deep Pages

- [History Docs Hub](history/README.md)
- [Agent LLM Docs Hub](llm/README.md)
- [Session Runtime and Config Rewire Reference](session_runtime_and_config_rewire_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Conversation Context and Event Presenter Prompt-Metadata Reference](llm/conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [LLM Stream Processor Token Count and Cache Diagnostics Reference](llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md)
- [History Committer and Result-Processor Boundary Reference](history/history_committer_and_result_processor_boundary_reference.md)
- [Tool-Call-ID Staging and Tool-Output History Row Contract Reference](history/tool_call_id_staging_and_tool_output_history_row_contract_reference.md)
- [Recovery Docs Hub](recovery/README.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Agent Tools Shared-Utility Docs Hub](tools/shared/README.md)
- [Request-ID Shortener Utility and Logging Contract Reference](tools/shared/request_id_shortener_utility_and_logging_contract_reference.md)

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
