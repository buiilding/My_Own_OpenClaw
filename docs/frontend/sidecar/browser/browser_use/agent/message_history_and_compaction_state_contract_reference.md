---
summary: "Deep reference for Browser Use message-manager view models: step history string rendering, system/state/context message ordering, and mutable compaction/read-state bookkeeping."
read_when:
  - When changing message-history formatting or history-item invariants in `agent/message_manager/views.py`.
  - When debugging state-message assembly ordering, read-state image injection, or compaction bookkeeping persistence.
title: "Agent Message History and Compaction State Contract Reference"
---

# Agent Message History and Compaction State Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/agent/message_manager/views.py`

## `HistoryItem` Contract

Purpose:

- captures one agent-step textual memory unit with optional error/system content

Validation and rendering:

- `model_post_init(...)` forbids `error` and `system_message` being present together
- `to_string()` behavior:
  - error path renders `<step>` block with error only
  - system-message path returns system message directly
  - default path composes non-empty fields in order: `evaluation_previous_goal`, `memory`, `next_goal`, `action_results`
- step label uses `step` when step number is present, otherwise `step_unknown`

## `MessageHistory` Contract

Purpose:

- stores current prompt history components separated by role

Fields:

- optional `system_message`
- optional `state_message`
- `context_messages` list

Ordering guarantee:

- `get_messages()` always returns `system -> state -> context[]`

## `MessageManagerState` Contract

Purpose:

- serializable mutable state for higher-level message manager orchestration

Key fields:

- `history`: `MessageHistory`
- `tool_id`: monotonic tool-call id seed (`1` default)
- `agent_history_items`: initialized with synthetic `step 0` system message (`Agent initialized`)
- `read_state_description`: current short read-state text
- `read_state_images`: one-step image payload queue for next state message
- compaction fields:
  - `compacted_memory`
  - `compaction_count`
  - `last_compaction_step`

## Related Docs

- [Frontend Sidecar Browser Use Agent Docs Hub](README.md)
- [Agent State, Output Schema, Action Results, History, and Error Handling Contract Reference](agent_state_output_history_and_error_handling_contract_reference.md)
- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
