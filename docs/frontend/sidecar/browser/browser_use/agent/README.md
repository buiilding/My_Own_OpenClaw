---
summary: "Frontend sidecar browser_use agent docs sub-hub for agent state/output schemas, loop detection and history serialization contracts, and message-manager history/compaction state structures."
read_when:
  - When changing Browser Use agent data models, output schema variants, history persistence, or loop-detection behavior.
  - When debugging message history compaction, result metadata serialization, or error-formatting behavior sent back to the LLM.
title: "Frontend Sidecar Browser Use Agent Docs Hub"
---

# Frontend Sidecar Browser Use Agent Docs Hub

## Deep Pages

- [Agent State, Output Schema, Action Results, History, and Error Handling Contract Reference](agent_state_output_history_and_error_handling_contract_reference.md)
- [Agent Message History and Compaction State Contract Reference](message_history_and_compaction_state_contract_reference.md)

## Related Pages

- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
- [Frontend Sidecar Browser Use Browser Docs Hub](../browser/README.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)
- [Frontend Sidecar Browser Use Tokens Docs Hub](../tokens/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/agent/views.py`
- `frontend/src/main/python/tools/browser/browser_use/agent/message_manager/views.py`
