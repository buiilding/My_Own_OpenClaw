---
summary: "Deep reference for `ConversationHistory` tool-output write semantics: staged tool_call_id consumption modes, dual-row output strategy, token-cache incremental updates, and rehydrate/linkage normalization behavior."
read_when:
  - When changing `ConversationHistory.add_tool_output` or `stage_tool_call_ids` behavior.
  - When debugging tool-call/tool-output linkage issues in provider-normalized history or token-count drift after tool turns.
title: "Tool-Call-ID Staging and Tool-Output History Row Contract Reference"
---

# Tool-Call-ID Staging and Tool-Output History Row Contract Reference

## Canonical Modules

- `backend/src/agent/session/state.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/history/history_committer.py`
- `tests/backend/test_conversation_history.py`
- `tests/backend/test_interaction_loop.py`

## Staging API and Consumption Modes

`ConversationHistory.stage_tool_call_ids(tool_call_ids, consume_all_on_next_output=False)` stores pending ids for next tool-output commit.

`_consume_tool_call_ids_for_next_output()` behavior:

- no staged ids -> `[]`
- `consume_all_on_next_output=True` -> returns all staged ids once, then clears
- default mode -> consumes one id per output call (FIFO)

`InteractionLoop` staging sites:

- normal tool turns: stage parsed tool-call ids before execution
- bundle path: sets `consume_all_on_next_output=is_bundle`
- recoverable malformed tool-call path: stages synthetic single id before synthetic output write

## Dual-Row Tool Output Strategy

`add_tool_output(message, image_data)` writes:

1. zero or more `role='tool'` rows with `tool_call_id` (from staged ids)
2. always one legacy `role='user'` `TOOL_OUTPUT` row (includes screenshot when present)

Reason:

- provider-facing tool-call linkage needs explicit `tool_call_id` rows
- legacy multimodal continuity relies on user-role row carrying screenshot payload

## Token Cache Behavior on Tool Output

`ConversationHistory` keeps model-scoped token cache:

- `_cached_token_count`
- `_cached_token_count_model`

On tool output:

- if cache valid, computes token delta for newly appended rows via `count_message_tokens(...)`
- if no pruning occurred, increments cached total in O(1)
- if pruning occurred, cache invalidated and recomputed on next read

## Rehydrate and Linkage Preservation

`replace_with_entries(...)` preserves tool linkage fields:

- role normalization includes explicit `tool` and `assistant`
- tool rows keep `tool_call_id`
- assistant tool-call rows keep `tool_calls`

This allows restored history to survive provider normalization without dropping tool linkage.

## Test-Backed Invariants

`tests/backend/test_conversation_history.py` covers:

- image preservation across stored + llm views
- incremental token-cache update for tool outputs
- cache invalidation when pruning occurs
- rehydrate preservation of assistant tool-call row and linked tool row

`tests/backend/test_interaction_loop.py` covers:

- recoverable malformed tool-call path stages id + writes tool output to history
- fallback summary path uses latest tool output text when final response is empty

## Drift Hotspots

1. removing legacy user-role tool-output row breaks screenshot continuity assumptions in downstream paths.
2. changing staged-id consumption mode can mismatch tool-call/tool-output ordering for bundled turns.
3. mutating tool-output token cache logic can reintroduce O(N) counting per tool event.
4. weakening rehydrate normalization can orphan tool rows from assistant tool-call records.

## Related Pages

- [Backend Agent History Docs Hub](README.md)
- [History Committer and Result-Processor Boundary Reference](history_committer_and_result_processor_boundary_reference.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)
