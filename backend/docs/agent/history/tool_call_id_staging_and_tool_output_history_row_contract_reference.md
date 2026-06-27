---
summary: "Deep reference for `ConversationHistory` tool-output write semantics: staged tool_call_id consumption modes, canonical multimodal tool-row strategy, token-cache incremental updates, and rehydrate/linkage normalization behavior."
read_when:
  - When changing `ConversationHistory.add_tool_output` or `stage_tool_call_ids` behavior.
  - When debugging tool-call/tool-output linkage issues in provider-normalized history or token-count drift after tool turns.
title: "Tool-Call-ID Staging and Tool-Output History Row Contract Reference"
---

# Tool-Call-ID Staging and Tool-Output History Row Contract Reference

## Canonical Modules

- `backend/src/agent/session/state.py`
- `backend/src/agent/session/message_builders.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/history/history_committer.py`
- `tests/backend/test_conversation_history.py`
- `tests/backend/test_interaction_loop.py`

## Staging API and Consumption Modes

`ConversationHistory.stage_tool_call_ids(tool_call_ids, consume_all_on_next_output=False)` stores pending ids for next tool-output commit.

`ConversationHistory.finalize_pending_tool_calls_as_cancelled(...)` reconciles staged ids when a turn is cancelled before tool results arrive, by writing synthetic `role='tool'` rows for each pending `tool_call_id`.

`_consume_tool_call_ids_for_next_output()` behavior:

- no staged ids -> `[]`
- `consume_all_on_next_output=True` -> returns all staged ids once, then clears
- default mode -> consumes one id per output call (FIFO)

`InteractionLoop` staging sites:

- normal tool turns: stage parsed tool-call ids before execution
- bundle path: sets `consume_all_on_next_output=is_bundle`
- recoverable malformed tool-call path: stages synthetic single id before synthetic output write

## Tool Output Storage Strategy

`add_tool_output(message, image_data, tool_name=None, compaction_facts=None)` writes:

1. when staged ids exist: one or more canonical `role='tool'` rows with `tool_call_id`
2. when staged ids exist and screenshot is present: attach `image_data` directly to the first canonical `role='tool'` row (multimodal `content=[text,image_url]` in LLM view)
3. `tool_name` and bounded `compaction_facts` are copied onto every stored tool-output row created by that commit
4. when no staged ids exist: one legacy `role='user'` `TOOL_OUTPUT` row with text (and screenshot, if present)

Builder ownership:

- linked tool rows are created via `build_tool_result_message(...)`
- fallback unlinked rows are created via `build_tool_output_message(...)`
- assistant tool-call rows remain owned by `build_assistant_message(...)`

Reason:

- provider-facing tool-call linkage needs explicit `tool_call_id` rows
- screenshot continuity stays on canonical linked tool rows
- duplicate tool-output text rows are avoided on linked tool turns
- compaction needs a structured side-channel for refs/urls/actions/failure-state that survives beyond plain text formatting

`compaction_facts` contract:

- optional bounded dict carried on `StoredMessage`
- not included in provider-facing `to_llm_message()` serialization
- consumed by compaction-specific renderers and debugging flows
- safe to omit for legacy/unstructured tool rows

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
- tool rows keep `tool_name`
- tool rows keep `compaction_facts`
- assistant tool-call rows keep `tool_calls`
- user rows rehydrate `user_query_raw` from `<user_query>...</user_query>` when present

Message-type normalization is split by boundary:

- SDK rehydrate projection emits canonical stored `MessageType` values before
  sending replay rows to the backend.
- `ConversationHistory.replace_with_entries(...)` accepts only canonical stored
  values (`user_query`, `assistant_response`, `tool_output`,
  `context_compaction`).
- Backend rehydrate rejects unknown or old stored message-type aliases instead
  of silently repairing projection drift.

This allows restored history to survive provider normalization without dropping tool linkage.

## Test-Backed Invariants

`tests/backend/test_conversation_history.py` covers:

- image preservation across stored + llm views
- incremental token-cache update for tool outputs
- cache invalidation when pruning occurs
- rehydrate preservation of assistant tool-call row and linked tool row
- cancellation reconciliation writes synthetic linked tool rows and clears staged ids

`tests/backend/test_interaction_loop.py` covers:

- recoverable malformed tool-call path stages id + writes tool output to history
- fallback summary path uses latest tool output text when final response is empty

## Drift Hotspots

1. changing tool-row multimodal conversion can break screenshot continuity for linked tool turns.
2. changing staged-id consumption mode can mismatch tool-call/tool-output ordering for bundled turns.
3. mutating tool-output token cache logic can reintroduce O(N) counting per tool event.
4. weakening rehydrate normalization can orphan tool rows from assistant tool-call records.
5. serializing `compaction_facts` into normal provider prompt history would bloat every LLM turn and defeat the purpose of keeping them history-only.

## Related Pages

- [Backend Agent History Docs Hub](README.md)
- [History Committer and Result-Processor Boundary Reference](history_committer_and_result_processor_boundary_reference.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)
