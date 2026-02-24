---
summary: "Full implementation plan for Codex-style conversation history compaction in WindieOS, with provider-agnostic strategy support and optional OpenAI remote compaction."
read_when:
  - Adding token-threshold history compaction to avoid context-window failures.
  - Implementing manual `compact-history` control over WebSocket.
  - Extending compaction to multiple model providers (OpenAI + non-OpenAI).
  - Aligning WindieOS compaction behavior with Codex (`/compact`, auto-compaction, replacement history).
---

# WindieOS Conversation History Compaction Plan (Codex-Aligned)

## Objective

Implement Codex-style conversation-history compaction in WindieOS so long threads stay usable without losing critical context.

Target behavior:
- Auto-compaction when token usage crosses a configurable threshold.
- Manual compaction trigger (like Codex `thread/compact/start` / `/compact`).
- Conversation history replaced with compacted history (not append-only summary spam).
- Strategy architecture supports multiple providers.
- OpenAI-specific remote compact endpoint support can be added without blocking provider-agnostic rollout.

## Why This Work

Current WindieOS behavior is message-count pruning only (`max_history_length`). That is not enough when token-heavy tool outputs, screenshots, and long XML context inflate prompt size before message count is reached.

Symptoms today:
- Context-window risk grows with long sessions.
- No explicit compaction lifecycle or visibility event.
- No manual escape hatch for users.
- No provider-agnostic compaction abstraction.

## Current Baseline (WindieOS)

Primary files and current constraints:
- `backend/src/agent/session/state.py`
  - `ConversationHistory` supports count-based pruning (`_prune_if_needed`), cached token counting, and transcript rehydrate.
  - No token-threshold compaction.
- `backend/src/agent/session/initializer.py`
  - Injects `max_history_length` only.
- `backend/src/agent/execution/executor.py`
  - User message is appended before interaction loop starts.
- `backend/src/agent/execution/interaction_loop.py`
  - No pre-iteration compaction gate.
- `backend/src/agent/llm/llm_stream_processor.py`
  - Emits token diagnostics (`TokenCountEvent`) but does not trigger compaction.
- `backend/src/core/config/models.py`
  - No compaction-specific config fields.
- `backend/src/api/schemas/incoming.py`
  - No `compact-history` incoming message type.
- `backend/src/core/events/streaming_events.py` and `backend/src/core/types/enums.py`
  - No context-compaction event type.
- `backend/src/llm/providers/*`
  - Provider abstraction exists, but no compact endpoint contract.

## Codex Reference Model (What to Mirror)

Reference behavior from local Codex source:
- Auto compact gates in turn flow:
  - pre-sampling compaction check
  - mid-turn compaction when follow-up needed and token threshold exceeded
  - see `codex-rs/core/src/codex.rs` (`run_pre_sampling_compact`, `run_auto_compact`)
- Manual compaction operation exists:
  - app-server `thread/compact/start`
  - see `codex-rs/app-server/README.md`
- Two strategy paths:
  - Local inline summarize -> compacted replacement history (`core/src/compact.rs`)
  - OpenAI remote compact endpoint `/v1/responses/compact` returns replacement history (`core/src/compact_remote.rs`, `codex-api/src/endpoint/compact.rs`)
- Compaction emits explicit lifecycle items/events:
  - `ContextCompaction` item started/completed
- Compaction replaces history and persists compaction marker in rollout.

Important clarification for implementation decisions:
- In Codex local-inline compaction: model returns text summary; client builds replacement history.
- In Codex remote compaction: API returns compacted history items directly (not just text).

WindieOS should support both patterns via a shared internal strategy interface.

## Scope

In scope:
- Backend runtime compaction pipeline.
- Auto + manual compaction triggers.
- Provider strategy abstraction (provider-agnostic default).
- Optional OpenAI remote strategy path.
- Streaming/outgoing event visibility for compaction lifecycle.
- Tests + docs.

Out of scope (first rollout):
- Frontend UX redesign beyond event handling.
- Full transcript migration for historical conversations.
- Semantic memory behavior redesign.

## Architecture Proposal

### 1) Add a compaction domain module

Create new backend module family:
- `backend/src/agent/compaction/engine.py`
- `backend/src/agent/compaction/strategies/base.py`
- `backend/src/agent/compaction/strategies/inline_summary.py`
- `backend/src/agent/compaction/strategies/openai_remote.py` (phase-gated)
- `backend/src/agent/compaction/models.py`
- `backend/src/agent/compaction/prompt.py`

Core contracts:
- `CompactionEngine.compact(session, reason, mode, current_turn_context) -> CompactionResult`
- `CompactionStrategy.compact(input: CompactionInput) -> StrategyOutput`
- `CompactionResult` includes:
  - `replacement_entries` (canonical history entries for `ConversationHistory`)
  - `summary_text`
  - `strategy_name`
  - `metrics` (before/after token counts, removed messages)

### 2) Strategy model (multi-provider)

#### Default strategy (Phase 1)
`InlineSummaryCompactionStrategy` (provider-agnostic):
- Build compaction prompt and ask current configured model to summarize.
- Parse/normalize summary text.
- Build replacement history locally using deterministic builder.

This path works for OpenAI, Anthropic, Gemini, local providers, etc.

#### Optional provider-specific strategy (Phase 2)
`OpenAIRemoteCompactionStrategy`:
- For OpenAI provider only, call remote compaction endpoint and receive replacement history.
- Filter/sanitize returned items and map to WindieOS `StoredMessage` entries.
- Fall back to inline strategy on failure.

Selection policy:
- `strategy=auto`: provider-specific strategy if available, else inline.
- Config can force `inline` for all providers.

### 3) Compacted history builder semantics

Codex-aligned replacement semantics:
- Keep a bounded tail of recent real user messages (token budget / count cap).
- Append one compaction summary message with stable prefix marker.
- Preserve system prompt handling (already outside stored history in WindieOS).
- Preserve required tool-linkage invariants for recent unresolved tool-call spans only.

WindieOS-specific safety rule:
- If last assistant turn includes unresolved tool-call linkage required for next iteration, keep that minimal tail segment unmodified.

### 4) Trigger points

#### Pre-query (before model sampling)
Add a preflight compaction check before each new query turn is sent to model.

Recommended sequencing in `AgentExecutor.process_query`:
1. build/format incoming user content
2. estimate projected token usage (`history + pending user message`)
3. if threshold exceeded and compaction enabled -> run compaction
4. append user message
5. run interaction loop

#### Mid-loop follow-up compaction
In `InteractionLoop.run_loop`, after tool-result round trips and before next sampling request:
- if conversation token count still above threshold and loop needs another model iteration, compact mid-turn.

Compaction must be idempotent per turn iteration guard to avoid compact loops.

#### Manual compaction
Add incoming message `compact-history` to trigger compaction out-of-band.
- If active query task exists for user, either reject with clear error or queue after task completion (choose explicit policy; recommendation: reject with actionable message in v1).

### 5) Event/observability model

Add explicit compaction lifecycle events:
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`

Payload fields:
- `reason` (`auto-pre`, `auto-mid`, `manual`)
- `strategy`
- `before_tokens`
- `after_tokens`
- `removed_messages`
- `summary_preview` (short, optional)

Map events into formatter/outgoing schema like existing streaming events.

## Config Additions

Add compaction settings to `AppConfig` (`backend/src/core/config/models.py`) and defaults (`backend/src/core/config/app_config.py`):
- `history_compaction_enabled: bool = False`
- `history_compaction_trigger_tokens: int = 120000` (exact default to tune)
- `history_compaction_target_tokens: int = 60000`
- `history_compaction_keep_recent_user_messages: int = 6`
- `history_compaction_summary_max_tokens: int = 1200`
- `history_compaction_strategy: Literal["auto", "inline", "openai-remote"] = "auto"`
- `history_compaction_prompt: Optional[str] = None`
- `history_compaction_cooldown_turns: int = 1`

Validation updates in `backend/src/core/validation/validators.py`.

## API and Routing Additions

### Incoming schema
File: `backend/src/api/schemas/incoming.py`
- Add `CompactHistoryPayload` + `CompactHistoryMessage`.
- Extend `IncomingMessage` union.

### Message type constants
File: `backend/src/api/contracts/message_types.py`
- Add incoming type: `compact-history`.
- Add outgoing types for compaction lifecycle.

### Routing
File: `backend/src/core/container/incoming_routing.py`
- Register route for `compact-history`.

### Handler
Add:
- `backend/src/api/handlers/compact_history.py`
- wire in container (`backend/src/core/container/api_container.py`)

## Data/State Model Changes

### ConversationHistory API extensions
File: `backend/src/agent/session/state.py`
- Add atomic replacement helper using `StoredMessage` list directly:
  - `replace_with_stored_messages(messages: List[StoredMessage])`
- Add helper extractors for compaction candidates:
  - user-message extraction from structured fields
  - optional unresolved tool-call span detection
- Keep existing `max_history_length` pruning as fallback safety net.

### Message typing
File: `backend/src/core/types/enums.py`
- Add `MessageType.CONTEXT_COMPACTION` (recommended for explicit transcript semantics).

File: `backend/src/core/messages/structures.py`
- Ensure `StoredMessage.to_llm_message()` handles compaction type safely as normal text role message.

### Rehydrate compatibility
File: `backend/src/api/services/rehydrate_execution.py`
- Normalize compaction message types (`context-compaction`, `context_compaction`) to `MessageType.CONTEXT_COMPACTION`.
- Preserve backward compatibility with old transcripts.

## Detailed Phased Execution Plan

## Phase 0: Scaffolding + Contracts

Deliverables:
- Compaction module skeleton and typed contracts.
- Config fields + validation.
- Unit tests for config parsing/validation.

Files:
- `backend/src/agent/compaction/*` (new)
- `backend/src/core/config/models.py`
- `backend/src/core/config/app_config.py`
- `backend/src/core/validation/validators.py`
- `tests/backend/test_config_models.py`
- `tests/backend/test_validation_utils.py`

## Phase 1: Provider-Agnostic Inline Compaction (MVP)

Deliverables:
- Inline summarize strategy works for all providers.
- Replacement history builder with deterministic output.
- Pre-query auto-compaction gate.

Files:
- `backend/src/agent/compaction/strategies/inline_summary.py`
- `backend/src/agent/compaction/engine.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/agent/session/state.py`
- `tests/backend/test_conversation_history.py`
- `tests/backend/test_llm_stream_processor.py`
- new: `tests/backend/test_history_compaction_engine.py`

## Phase 2: Mid-Loop Auto Compaction + Guardrails

Deliverables:
- Mid-turn compaction when follow-up iterations would exceed threshold.
- Cooldown/idempotency guard per query turn.
- Failure fallback: continue turn without crash.

Files:
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/compaction/engine.py`
- new: `tests/backend/test_interaction_loop_compaction.py`

## Phase 3: Manual Compaction API + Events

Deliverables:
- `compact-history` incoming message + handler.
- Streaming compaction lifecycle events.
- Outgoing schema/formatter coverage.

Files:
- `backend/src/api/schemas/incoming.py`
- `backend/src/api/contracts/message_types.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/handlers/compact_history.py` (new)
- `backend/src/core/events/streaming_events.py`
- `backend/src/core/types/enums.py`
- `backend/src/api/contracts/formatter_specs.py`
- formatter(s) in `backend/src/api/processing/formatters/`
- `backend/src/api/schemas/outgoing.py`
- tests:
  - `tests/backend/test_api_handlers.py`
  - `tests/backend/test_incoming_routing.py`
  - `tests/backend/test_events.py`
  - `tests/backend/test_outgoing_schema_contract.py`
  - new: `tests/backend/test_compact_history_handler.py`

## Phase 4: OpenAI Remote Strategy (Optional, Non-Blocking)

Deliverables:
- OpenAI-only remote compact strategy path.
- Strategy auto-selection and fallback to inline path.
- Observability showing strategy used.

Files:
- `backend/src/agent/compaction/strategies/openai_remote.py`
- `backend/src/llm/client.py` and/or provider layer additions for unary compact endpoint contract.
- provider interface updates in `backend/src/llm/providers/base.py`.
- tests:
  - new: `tests/backend/test_history_compaction_openai_remote.py`
  - `tests/backend/test_llm_client.py`

## Phase 5: Docs + Rollout Hardening

Deliverables:
- Runtime docs and API docs updated.
- Feature flag default rollout plan.
- Metrics and alert hooks.

Files:
- `docs/backend/runtime/conversation_history_and_prompt_context_runtime_reference.md`
- `docs/backend/api/http_and_ws_endpoint_reference.md`
- `docs/backend/config/config_fields_and_runtime_policy.md`
- `docs/README.md` (if index update needed)

## Test Matrix (Must Pass)

1. Unit tests
- Replacement history builder: token budget, keep-last-user rules, summary placement.
- Strategy parsing and fallback behavior.
- Config validation bounds.

2. Integration tests
- Long query auto-compacts and still answers.
- Mid-loop tool turn compacts and continues correctly.
- Manual `compact-history` emits started/completed events.

3. Regression tests
- Tool-call/tool-output linkage preserved for active span.
- Rehydrate with mixed old/new message types remains stable.
- Existing message-count pruning still functions when compaction disabled.

4. Provider matrix
- OpenAI, Anthropic, Gemini, Kimi-Coding, one local provider path.
- Validate inline strategy works on all.
- Validate OpenAI remote strategy fallback behavior.

## Rollout Strategy

Recommendation:
- Stage 1: ship inline strategy only, feature-flag off by default.
- Stage 2: enable for internal users with conservative thresholds.
- Stage 3: enable manual compaction endpoint publicly.
- Stage 4: enable OpenAI remote strategy behind separate flag.

Feature flags:
- `history_compaction_enabled`
- `history_compaction_manual_enabled`
- `history_compaction_openai_remote_enabled`

## Risks and Mitigations

Risk: Over-compaction loses task-critical context.
- Mitigation: preserve recent user turns, unresolved tool span, configurable target budget.

Risk: Compaction loops (compact every iteration).
- Mitigation: per-turn cooldown + minimum token delta requirement.

Risk: Provider-specific parse drift.
- Mitigation: strict output normalization + fallback to inline local builder.

Risk: Transcript pollution for semantic memory.
- Mitigation: tag compaction message type and filter from semantic summarizer candidate rules.

## Definition of Done

Ship criteria:
- Auto and manual compaction work end-to-end.
- Disabled flag path has zero behavior change.
- New tests cover compaction engine, loop integration, API handler, events, and schema contracts.
- Docs updated for runtime flow + API contracts + config fields.
- Verified on at least three providers in staging.

## Implementation Order for Parallel Agents

Suggested split for multi-agent execution:

Agent A (core runtime):
- Phase 0 + Phase 1 + Phase 2.

Agent B (API/events/contracts):
- Phase 3 + tests.

Agent C (provider extension):
- Phase 4 OpenAI remote strategy + tests.

Agent D (docs/hardening):
- Phase 5 docs and rollout notes.

Merge order:
1. Core runtime foundation.
2. API/events.
3. Optional OpenAI remote.
4. Docs and final validation.

