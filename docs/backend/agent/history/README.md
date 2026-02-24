---
summary: "Backend agent history docs sub-hub for tool-result commit boundaries, tool-call-id staging semantics, and conversation-history storage invariants."
read_when:
  - When changing `backend/src/agent/history/*`, `ConversationHistory.add_tool_output`, or tool-result processing commit order.
  - When debugging missing `tool_call_id` linkage, duplicated tool rows, or history token-count cache drift after tool turns.
title: "Backend Agent History Docs Hub"
---

# Backend Agent History Docs Hub

## Deep Pages

- [History Committer and Result-Processor Boundary Reference](history_committer_and_result_processor_boundary_reference.md)
- [Tool-Call-ID Staging and Tool-Output History Row Contract Reference](tool_call_id_staging_and_tool_output_history_row_contract_reference.md)

## Related Pages

- [Backend Agent Docs Hub](../README.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool Result Ingress and Storage Reference](../../tools/tool_result_ingress_and_storage_reference.md)

## Code Scope

- `backend/src/agent/history/history_committer.py`
- `backend/src/agent/tools/processing/processor.py`
- `backend/src/agent/tools/processing/transformer.py`
- `backend/src/agent/session/state.py`
- `backend/src/agent/execution/interaction_loop.py`
- `tests/backend/test_conversation_history.py`
- `tests/backend/test_interaction_loop.py`
