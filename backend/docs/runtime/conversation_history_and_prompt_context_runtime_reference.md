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
- `backend/src/api/services/rehydrate_entry_normalization.py`
- `backend/src/api/services/rehydrate_tool_call_normalization.py`
- `backend/src/api/services/rehydrate_transparency_resolution.py`
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

Current query append path (`AgentExecutor.process_query(...)`):

- backend stores frontend-enriched message content as an opaque rendered string (`content`)
- `_resolve_raw_user_query(...)` extracts `user_query_raw` with strict fallback semantics:
  - scans only first `300_000` chars of rendered content (`_USER_QUERY_PARSE_MAX_CHARS`)
  - uses the last `<user_query>...</user_query>` match when multiple are present
  - HTML-unescapes extracted text
  - falls back to raw query input if tag missing/empty
- `<episodic_memory>` and `<semantic_memory>` blocks are preserved inside rendered `content` for model context, but are not separately parsed into structured `episodic_memory` / `semantic_memory` fields on the standard query path
- practical result: `StoredMessage.user_query_raw` is reliably populated; `StoredMessage.episodic_memory` and `StoredMessage.semantic_memory` are currently optional and generally unset unless a caller explicitly provides structured values

Session initialization sets system prompt source of truth:

- `init_prompt_and_history(...)` builds `PromptConstructor`
- same constructor’s `system_prompt` is injected into `ConversationHistory(system_prompt=...)`

## Prompt Assembly and Iteration Caching

`ConversationContext.get_prompt(iteration)` controls first-turn vs subsequent-turn behavior.

Iteration 1:

1. call `PromptConstructor.build_provider_prompt(stored_messages=self.history, include_tools=True)`
2. receive one provider prompt object containing messages, tool schemas, and metadata
3. cache `tool_schemas` and `prompt_metadata`

Iteration > 1:

- rebuild provider messages through `PromptConstructor.build_prompt_messages(self.history)`
- return the rebuilt messages plus cached tool schemas/metadata

This keeps every provider call on the same prompt-construction path while
preserving a stable tool schema surface across loop turns.

## Prompt Metadata Transparency Path

`PromptConstructor._build_user_message_metadata(...)` extracts user-facing transparency fields from rendered prompt history:

- `original_query`
- full rendered user content
- inferred `context_type` (`initial` vs `sequential`)
- extracted `<system_context>...</system_context>` block when older history still contains one
- extracted `<active_window>` value when older history still contains one (fallback `Unknown`)

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

Normal resume prefers persisted backend-normalized model-history checkpoints.
When `rehydrate-conversation.payload.model_history` is present, the backend
validates checkpoint row conversation/revision identity and installs those rows
directly into `ConversationHistory` without resolving display screenshots or
rebuilding model history from SDK display/runtime events. System rows restore
the session system prompt; non-system rows become the active model-facing
history. This path preserves bounded tool output and tool-call/tool-output
linkage as backend emitted it.

When no model-history checkpoint exists, `replace_with_entries(entries)`
reconstructs history from SDK rehydrate payloads as the migration fallback.

Normalization includes:

- role normalization (`tool`, `assistant`, fallback user)
- API rehydrate boundary validation of SDK-projected canonical stored
  `MessageType` values
- preservation of assistant tool-call rows with `tool_calls`
- preservation of tool rows with `tool_call_id`
- structured transparency restore:
  - `transparency.fullUserMessage.content` overrides visible user text during rehydrate
  - `transparency.fullAssistantMessage.content` overrides visible assistant content during rehydrate
  - first available `transparency.systemPrompt` is restored onto `ConversationHistory.system_prompt`
- sanitization of internal bundle orchestration traces from explicit
  `tool-bundle` / `bundled_tools` tool-name metadata into plain assistant
  context rows so rehydrate does not synthesize non-executable tool names into
  assistant `tool_calls`
- Gemini continuity guard: tool-call `thought_signature` is preserved when
  rehydrated structured tool-call payloads include it
- tool-call normalization is delegated to
  `rehydrate_tool_call_normalization.py` so entry-level rehydrate routing stays
  isolated from structured tool-call shape handling
- transparency/system-prompt/full-content restoration helpers are delegated to `rehydrate_transparency_resolution.py` so entry normalizer state/routing stays decoupled from content-source precedence logic

`ConversationHistory.replace_with_entries(...)` requires canonical stored
`MessageType` values:

- `user_query`
- `assistant_response`
- `tool_output`
- `context_compaction`

The SDK rehydrate projection owns current message-type emission before entries
reach the backend. Rows without a message type still default from role for SDK
snapshots, but explicit unknown or old stored message-type aliases are rejected
instead of being repaired at the backend boundary.

Key outcome: rehydrated history can be passed through provider normalization without dropping linked tool messages.

## Token Count Cache Semantics in History

`ConversationHistory` maintains per-model cached token counts:

- `_cached_token_count`
- `_cached_token_count_model`

Invalidation triggers:

- `add_user_message(...)`
- `add_assistant_message(...)`
- `clear()`
- `replace_with_entries(...)`

Incremental optimization path:

- `add_tool_output(...)` computes token delta with `count_message_tokens(...)` when cache is valid
- applies O(1) incremental add without any count-based history slicing

## Interaction Loop Commit Ordering

From `InteractionLoop.run_loop()`:

1. get prompt context
2. stream LLM response
3. parse native tool calls into `ParsedResponse`
4. when tool calls exist, store assistant tool-call turn in history first
5. if a parsed call carries `metadata.model_facing_tool_call` (for example invalid `computer_use` fail-close), assistant history uses that preserved raw payload instead of the rewritten internal executable tool name
6. execute tools
7. process results and commit tool outputs for next-iteration context

`finally` block always attempts `process_results(...)` to prevent leaked pending tool state when execution errors/disconnects occur.

After assistant completion and after tool-result commits, `InteractionLoop`
builds a provider-neutral model-history checkpoint from
`ConversationHistory.get_stored_messages()` and emits `model-history-updated`
when the active stream context has both `conversation_ref` and `revision_id`.
Applied manual compaction follows the same checkpoint contract after
`context-compaction-completed`, using the compacted backend
`ConversationHistory` as the source so SDK normal resume installs the summary
ledger instead of an old pre-compaction model history.
The query websocket payload accepts optional `revision_id`; the query execution
service records it on `SessionRuntimeState.active_revision_id` alongside the
active turn and conversation refs. Checkpoint rows include backend stored roles,
canonical `message_type`, bounded `content`, tool-call linkage, tool name,
artifact `image_refs`, and compaction facts. They intentionally omit raw
`image_data` and provider-specific prompt payloads.

Storage/API migration note: no migration is required for this emission step.
When no model-history checkpoint exists, current SDK normal resume skips
backend hydration instead of sending an event/display projection. Legacy
rehydrate projections remain available to SDK store diagnostics/export paths,
but they are no longer the backend session-history install path.

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
- model-history checkpoint events require active revision context and omit raw
  image payloads

`tests/backend/test_api_handlers.py` (rehydrate path) validates:

- tool-call rows are reconstructed as assistant tool-call entries
- subsequent tool-output rows carry matching `tool_call_id`
- optional Gemini `thought_signature` on assistant tool-calls is preserved through normalize/rehydrate/history replay so follow-up tool turns can include provider-required signature metadata

## Drift Hotspots

1. changing staged tool-call consumption semantics can break provider tool-message ordering
2. mutating `get_history()` return value in callers corrupts shared cache expectations
3. changing rehydrate role/type normalization can orphan tool outputs from tool_call ids
4. altering first-iteration prompt metadata extraction can break transparency events in UI
