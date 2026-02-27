---
summary: "Backend runtime reference for conversation-history storage, prompt-context assembly/caching, tool-call-to-tool-output linkage, and rehydrate normalization semantics."
read_when:
  - When changing `ConversationHistory`, prompt metadata generation, or interaction-loop prompt retrieval behavior.
  - When debugging missing tool-result context in later turns, tool_call_id linkage drift, or transcript rehydrate role/type normalization.
title: "Conversation History and Prompt Context Runtime Reference"
---

# Conversation History and Prompt Context Runtime Reference

## Canonical Modules

- `backend/src/agent/session/state.py`
- `backend/src/agent/session/message_builders.py`
- `backend/src/agent/llm/conversation_context.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/history/history_committer.py`
- `backend/src/agent/session/initializer.py`

## Data Model: Stored vs LLM Message Views

`ConversationHistory` stores canonical rows as `StoredMessage` objects and maintains a parallel `_llm_history_cache` list for O(1) LLM prompt retrieval.

Core views:

- `get_stored_messages()` -> structured rows with `message_type`, `tool_call_id`, optional images/tool_calls
- `get_history()` -> LLM message list, includes system prompt first (if present), returns internal cache by read-only contract
- `get_history_mutable()` -> deep-copied mutable LLM message list

`message_builders.py` is the constructor/normalization boundary used by `ConversationHistory`:

- `build_user_message(...)` -> canonical `role=user`, `message_type=USER_QUERY`
- `build_assistant_message(...)` -> canonical `role=assistant`, `message_type=ASSISTANT_RESPONSE`
- `build_tool_result_message(...)` -> canonical linked `role=tool`, `message_type=TOOL_OUTPUT`, includes `tool_call_id`
- `build_tool_output_message(...)` -> fallback unlinked `role=user`, `message_type=TOOL_OUTPUT`

Session initialization sets system prompt source of truth:

- `init_prompt_and_history(...)` builds `PromptConstructor`
- same constructor’s `system_prompt` is injected into `ConversationHistory(system_prompt=...)`

## Prompt Assembly and Iteration Caching

`ConversationContext.get_prompt(iteration)` controls first-turn vs subsequent-turn behavior.

Iteration 1:

1. call `PromptConstructor.build_prompt(stored_messages=self.history, include_tools=True)`
2. receive `(prompt_messages, tool_schemas, prompt_metadata)`
3. cache `tool_schemas` and `prompt_metadata`

Iteration > 1:

- skip prompt reconstruction
- return `history.get_history()` plus cached tool schemas/metadata

This makes later iterations cheap and preserves identical tool schema surface across loop turns.

## Prompt Metadata Transparency Path

`PromptConstructor._build_user_message_metadata(...)` extracts user-facing transparency fields from rendered prompt history:

- `original_query`
- full rendered user content
- inferred `context_type` (`initial` vs `sequential`)
- extracted `<system_context>...</system_context>` block
- extracted `<active_window>` value

`InteractionLoop` emits this metadata on first iteration through `EventPresenter.present_prompt_metadata(...)` as:

- `SystemPromptEvent`
- `UserMessageFullEvent`
- `ToolSchemasEvent`

## Tool Call -> Tool Output Linkage Model

`InteractionLoop` stages tool call ids before execution:

- `history.stage_tool_call_ids(tool_call_ids, consume_all_on_next_output=is_bundle)`

History consumption semantics in `ConversationHistory.add_tool_output(...)`:

- when staged ids exist, history writes one or more canonical `role=tool` rows with `tool_call_id`
- if staged ids exist and screenshot payload(s) are present, history attaches `image_data` directly to the first canonical `role=tool` row (multimodal `content=[text,image_url,...]` in LLM view)
- if no staged ids exist, history writes a single legacy `TOOL_OUTPUT` row (`role=user`) with text (and optional screenshot payloads)
- for bundles, `consume_all_on_next_output=True` consumes all staged ids on next output
- for non-bundles, one staged id consumed per output event

This preserves strict provider tool-message linkage while keeping screenshot continuity without duplicated tool-output text rows or companion screenshot rows.

## Rehydrate Normalization Rules

`replace_with_entries(entries)` reconstructs history from frontend transcript payloads.

Normalization includes:

- role normalization (`tool`, `assistant`, fallback user)
- message_type normalization (`tool-output`, `tool-call`, `llm-text`, `user`, etc.)
- preservation of assistant tool-call rows with `tool_calls`
- preservation of tool rows with `tool_call_id`

`normalize_message_type(role, message_type)` compatibility aliases:

- tool variants (`tool`, `tool_output`, `tool_call`) -> `TOOL_OUTPUT`
- compaction variants (`context_compaction`, `compaction`, `context_summary`) -> `CONTEXT_COMPACTION`
- assistant variants (`assistant`, `assistant_response`, `llm_text`, `error`) -> `ASSISTANT_RESPONSE`
- user variants (`user`, `user_query`, `query`) -> `USER_QUERY`
- fallback by role when `message_type` is absent/unknown (`assistant` -> assistant response, `tool` -> tool output, else user query)

Key outcome: rehydrated history can be passed through provider normalization without dropping linked tool messages.

## Token Count Cache Semantics in History

`ConversationHistory` maintains per-model cached token counts:

- `_cached_token_count`
- `_cached_token_count_model`

Invalidation triggers:

- `add_user_message(...)`
- `add_assistant_message(...)`
- `clear()`
- pruning in `_prune_if_needed()`
- `replace_with_entries(...)`

Incremental optimization path:

- `add_tool_output(...)` computes token delta with `count_message_tokens(...)` when cache is valid
- applies O(1) incremental add only if pruning did not occur

## Interaction Loop Commit Ordering

From `InteractionLoop.run_loop()`:

1. get prompt context
2. stream LLM response
3. parse native tool calls into `ParsedResponse`
4. when tool calls exist, store assistant tool-call turn in history first
5. execute tools
6. process results and commit tool outputs for next-iteration context

`finally` block always attempts `process_results(...)` to prevent leaked pending tool state when execution errors/disconnects occur.

## HistoryCommitter Role

`HistoryCommitter.commit(...)` is intentionally narrow:

- receives already processed result (`formatted_message`, optional screenshot)
- calls `history.add_tool_output(...)`

It does not transform content or make control-flow decisions.

## Test-Backed Invariants

`tests/backend/test_conversation_history.py` validates:

- system prompt inclusion order
- pruning keeps newest rows
- image preservation in stored + LLM multimodal views
- mutable history copy isolation
- per-model token cache behavior
- incremental token update for tool outputs
- rehydrate preservation of assistant tool-call + tool tool_call_id linkage

`tests/backend/test_interaction_loop.py` validates:

- empty final-response fallback uses latest tool output summary
- fallback strips `<system_context>` payload before user-facing completion

`tests/backend/test_api_handlers.py` (rehydrate path) validates:

- tool-call rows are reconstructed as assistant tool-call entries
- subsequent tool-output rows carry matching `tool_call_id`

## Drift Hotspots

1. changing staged tool-call consumption semantics can break provider tool-message ordering
2. mutating `get_history()` return value in callers corrupts shared cache expectations
3. changing rehydrate role/type normalization can orphan tool outputs from tool_call ids
4. altering first-iteration prompt metadata extraction can break transparency events in UI
