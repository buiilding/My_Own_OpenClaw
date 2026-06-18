---
summary: "Deep reference for backend history compaction internals: decision thresholds, target-budget retention, overflow recovery, inline strategy prompt/fallback behavior, and auto/manual event emission integration points."
read_when:
  - When changing `backend/src/agent/compaction/*` decision or strategy behavior.
  - When debugging `context-compaction-*` lifecycle events emitted from auto-pre/auto-mid/manual flows.
title: "History Compaction Engine Decision, Strategy, and Event Contract Reference"
---

# History Compaction Engine Decision, Strategy, and Event Contract Reference

## Canonical Modules

- `backend/src/agent/compaction/engine.py`
- `backend/src/agent/compaction/models.py`
- `backend/src/agent/compaction/prompt.py`
- `backend/src/agent/compaction/strategies/base.py`
- `backend/src/agent/compaction/strategies/inline_summary.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/api/handlers/compact_history.py`
- `tests/backend/test_history_compaction_engine.py`
- `tests/backend/test_interaction_loop_compaction.py`
- `tests/backend/test_compact_history_handler.py`

## Engine Initialization and Scope

`init_compaction_engine(session)` wires one `CompactionEngine` per `AgentSession`.

The engine keeps only one decision carryover value:

- `_last_provider_prompt_tokens` stores the highest provider-reported prompt-token count observed since the last applied compaction

Everything else is computed per call from current history/config/token services.

## Decision Contract (`CompactionEngine.evaluate`)

Inputs:

- `reason` (`auto-pre`, `auto-mid`, `manual`, `overflow-retry`)
- `force` (bypasses the threshold check)
- optional `pending_user_content` (used for `auto-pre` projected token calculation)

Computed values:

- `before_tokens`: prompt-builder token count, raised to the last provider-reported prompt-token high-water mark when provider usage is available
- `projected_tokens`: `before_tokens + estimate(pending_user_content)`
- `trigger_tokens`: resolved from config/model window
- `strategy_name`: always `inline`
- `user_turn_index`: count of `MessageType.USER_QUERY` in current stored history

Skip reasons returned via `CompactionDecision.skip_reason`:

- `disabled`
- `below-threshold`

Enabled gating:

- manual: `history_compaction_manual_enabled`
- auto: `history_compaction_enabled`

Threshold resolution order:

1. `history_compaction_trigger_tokens` when positive integer
2. WindieOS model catalog context window for the resolved runtime model id, otherwise LiteLLM model metadata
3. model window trigger at `context_window * 0.90` (minimum `2048`)
4. hard fallback `120000`

Every decision logs reason, should/skip state, before/projected/trigger tokens, local estimate, source (`local-estimate` or `provider-high-water`), user turn index, and force flag. This is intentionally info-level so live backend logs show why auto-pre or auto-mid did or did not run.

There is no compaction cooldown gate. If the projected prompt remains above the trigger after one applied compaction, the next auto-pre or auto-mid evaluation may compact again immediately.

`force=True` bypasses the threshold check, but does not bypass manual/auto enable flags.

## Apply Contract (`CompactionEngine.compact`)

If incoming/derived decision says `should_compact=False`:

- returns `CompactionResult(applied=False, skip_reason=...)`
- `after_tokens == before_tokens`
- no history mutation

If compaction proceeds:

1. load current stored messages
2. build `CompactionInput`:
  - `messages_to_compact`
  - `keep_tail_messages`
  - `summary_max_tokens`
  - optional `custom_prompt`
3. run inline strategy
4. build one replacement summary message:
  - role `assistant`
  - message type `context_compaction`
  - content prefixed with `[[CONTEXT COMPACTION SUMMARY]]`
5. replace history with:
  - `[summary_message, *keep_tail_messages]`
6. compute post metrics (`after_tokens`, `removed_messages`)
7. clear the provider prompt-token high-water mark

If `_build_compaction_input(...)` cannot produce compactable input:

- returns skipped result with `skip_reason="insufficient-history"`

Manual nuance:

- for `reason="manual"`, `allow_minimal_history=True` permits compacting short transcripts by collapsing full history into one summary row
- for `reason="overflow-retry"`, minimal-history compaction is also allowed so provider context-overflow recovery can still compact a short but oversized transcript

## Split/Retention Contract

`_build_compaction_input(...)` respects `history_compaction_keep_recent_user_messages`:

- walks history backward by `USER_QUERY` messages
- split index lands at the oldest message of the retained recent-user window
- compacts everything before that split
- keeps tail from split onward

This preserves recent user-context turn window while collapsing older history.

## Target Budget Contract

`history_compaction_target_tokens` is a post-compaction retention budget, not an auto-trigger threshold.

Before invoking the summary strategy, the engine checks the retained tail against:

- `tail_budget = history_compaction_target_tokens - history_compaction_summary_max_tokens`

If the retained tail is still too large:

- older retained-tail turns are moved into `messages_to_compact` so they are
  summarized instead of preserved verbatim
- turn-boundary trimming keeps a leading user message, assistant tool-call row,
  and matching tool-output rows together; it never keeps a tool output only
  because an earlier message from the same retained turn was trimmed
- if one remaining tail message is still oversized, its text is truncated with `[[TRUNCATED DURING CONTEXT COMPACTION]]`, structured multimodal payloads are removed, and `compaction_facts.context_compaction_truncated=true` is recorded

This keeps the prompt from staying oversized after a nominally successful compaction.

## Strategy and Prompt Contract

Only `InlineSummaryCompactionStrategy` is active. There is no backend config
selector for remote compaction.

Prompt rendering path:

- `render_messages_for_compaction_prompt(...)`
  - max transcript chars: `24000`
  - message-type aware rendering instead of raw `Role: content`
  - preserves XML-tagged history content, including tag markup, before summarization
  - prefers structured fields when available (`user_query_raw`, assistant `tool_calls`, tool `tool_name`, `tool_call_id`, `compaction_facts`)
  - when history exceeds budget, preserves both early context and most recent compacted context with a sampled middle section instead of truncating strictly from the front
- `build_compaction_prompt_messages(...)`
  - system prompt: fixed compaction instruction that requires exact identifiers plus confirmed-vs-inferred separation
  - user message: custom prompt override or default instruction + rendered transcript
- inline strategy request:
  - forwards `history_compaction_summary_max_tokens` as `max_output_tokens` to the LLM request path
  - standard LiteLLM providers map this to `max_tokens`
  - OpenAI Responses-native reasoning path maps this to `max_output_tokens`

LLM output normalization:

- non-empty response -> trimmed summary text
- empty response -> deterministic fallback summary built from the structured recent-tail renderer rather than raw line truncation

## Event Emission Integration

Auto-pre flow (`AgentExecutor.process_query`):

- evaluated before user message is appended to history
- includes pending enriched user message text in projected token estimate
- emits:
  - `context-compaction-started` when decision requires compaction
  - `context-compaction-completed` on success (with full `summary_preview`, `summary_text`, dev-only `replacement_history_preview`, replay-safe `replacement_history_entries`, and `skipped_reason`)
  - `context-compaction-failed` on exception

Auto-mid flow (`InteractionLoop.run_loop`):

- evaluated on iterations `> 1` before subsequent LLM sampling
- emits same started/completed/failed lifecycle events with `reason="auto-mid"`
- uses provider-reported prompt usage from the prior LLM request when available, which covers tokens charged for provider-native request shape such as tool schemas that local prompt-message estimates can undercount

Overflow recovery flow (`InteractionLoop.run_loop`):

- detects provider context-overflow errors from raised exceptions or stream `ErrorEvent` content
- detects empty failed Responses payloads with `finish_reason in {"incomplete", "length"}` when the compaction decision is above threshold
- runs one forced or threshold-gated compaction with `reason="overflow-retry"`
- retries the model request once after successful recovery compaction
- emits a visible error instead of silently completing if the retry still fails or recovery cannot compact

Manual flow (`CompactHistoryHandler`):

- rejects while query active (`context-compaction-failed` payload)
- otherwise runs `session.run_history_compaction(reason="manual", force=payload.force)`
- emits started only when decision should run
- always ends with completed payload (applied stats or `skipped_reason`)

`replacement_history_entries` contains replay-safe history rows derived from the backend `StoredMessage` replacement history. SDK/renderer persistence uses this payload to overwrite the hidden replay-state stream without mutating the user-visible transcript.

## Session Locking and Safety

- `AgentSession.run_history_compaction(...)` executes under session lock
- `AgentSession.process_query(...)` also runs under session lock, so auto-pre/auto-mid compaction for a query is serialized with that session’s query turn

This prevents concurrent history rewrites in one session.

## Drift Hotspots

1. Changing split-index logic without updating keep-recent-user semantics can remove active context unexpectedly.
2. Changing target-budget enforcement without updating retained-tail tests can leave compaction results above the intended budget.
3. Changing trigger fallback or `AUTO_TRIGGER_RATIO` without config/docs/test updates can silently alter compaction frequency.
4. Emitting compaction events in different order breaks client thinking-status transitions.
5. Introducing non-inline strategy selection without updating decision/result payload contracts can desync `strategy` values shown to clients.

## Related Docs

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Non-Query Handler and Control Flow Reference](../api/non_query_handler_and_control_flow_reference.md)
- [Config Fields and Runtime Policy](../config/config_fields_and_runtime_policy.md)
