---
summary: "Backend token-count runtime reference: token service normalization/fallback logic, provider usage diagnostics precedence, conversation-history token cache behavior, and websocket `token-count` event shaping."
read_when:
  - When changing token-count event payload fields, provider usage diagnostics extraction, or token estimation fallback behavior.
  - When debugging `usage_source` drift, cached token metrics, or conversation token cache invalidation/performance issues.
title: "Token Count Event and Usage Diagnostics Reference"
---

# Token Count Event and Usage Diagnostics Reference

## Canonical Modules

- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/token_counting.py`
- `backend/src/services/token_service.py`
- `backend/src/llm/providers/base.py`
- `backend/src/agent/session/state.py`
- `backend/src/core/events/streaming_events.py`
- `backend/src/api/processing/formatters/token_count.py`
- `backend/src/api/schemas/outgoing.py`

## End-to-End Event Path

1. `LLMStreamProcessor.get_response(...)` aggregates full assistant text.
2. `_count_tokens(...)` delegates to `agent.llm.token_counting.count_tokens(...)`.
3. Returned `TokenCounts` is emitted as `TokenCountEvent`.
4. `TokenCountEventFormatter` maps event -> websocket payload type `token-count`.
5. Outgoing schema validation (`TokenCountPayload`) enforces payload contract.

## TokenCounts Field Contract

`TokenCounts` fields:

- `prompt_tokens`
- `visible_output_tokens`
- `thinking_tokens`
- `output_tokens_total`
- `total_tokens`
- `conversation_tokens`
- `usage_source` (`provider` or `estimated`)
- `cached_tokens`
- `cache_hit`
- `cache_status`

Wire payload mirrors same fields under `payload`.

## Counting Precedence Rules

`agent.llm.token_counting.count_tokens(...)` merges two sources:

## Local estimates

- prompt estimate from `TokenService.count_tokens(prompt, model)`
- visible output estimate from `TokenService.count_tokens([assistant_msg], model)`
- conversation total from `ConversationHistory.get_token_count(model)`

## Provider diagnostics

From `llm_client.get_last_stream_cache_diagnostics()`:

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- optional `thinking_tokens`, `cached_tokens`, `cache_hit`, `status`

Precedence:

- if provider has prompt+completion+total -> `usage_source="provider"`
- otherwise -> `usage_source="estimated"` and totals derived from local estimates (+ thinking tokens when available)

## TokenService Normalization + Fallback

`TokenService.count_tokens(...)` behavior:

1. normalize each message to LiteLLM-compatible dict shape
2. preserve assistant `tool_calls` by converting internal shape to OpenAI function-call shape
3. call `litellm.token_counter(..., use_default_image_token_count=True)`

If counting fails:

- logs exception
- falls back to coarse estimate `total_chars // 4`
- multimodal fallback counts only text-bearing parts (`text`/`input_text`)

## Provider Usage Diagnostics Normalization

`LLMProvider.get_stream_cache_diagnostics(model)`:

- reads latest captured usage payload from stream/non-stream responses
- extracts tokens across multiple provider key conventions
- computes cache status:
  - cached tokens > 0 -> `hit`
  - cached tokens == 0 -> `miss`
  - cached tokens unavailable -> `unknown`

If usage payload missing:

- returns diagnostics with `status="unknown"` and reason `provider_usage_unavailable`

## Conversation Token Cache Behavior

`ConversationHistory` maintains per-model cache:

- `_cached_token_count`
- `_cached_token_count_model`

General invalidation:

- user message add
- assistant message add
- history clear/replace
- pruning events

Incremental optimization path:

- `add_tool_output(...)` can increment cached token count O(1) when:
  - cache already valid
  - no pruning happened after append
- otherwise cache invalidated and recomputed on next `get_token_count(model)`

## Output Schema Constraints

`TokenCountPayload` (`api/schemas/outgoing.py`) enforces:

- required numeric core fields
- `usage_source` literal: `provider | estimated`
- `cache_status` literal: `hit | miss | unknown | null`

This catches formatter/event drift before websocket emission.

## Runtime Diagnostics Logs

`LLMStreamProcessor` logs:

- prompt continuity cache hints (`cold_start`, `append_only`, `prefix_mutated`, etc.)
- provider cache diagnostics (`status`, `cache_hit`, token counts)
- total response timing with token totals

Useful for tracing mismatches between reported usage and local estimates.

## Debug Checklist

If frontend sees `usage_source="estimated"` unexpectedly:

1. inspect provider diagnostics extraction path in `LLMProvider.get_stream_cache_diagnostics`
2. confirm provider emitted usage payload for that response mode (stream/non-stream)
3. confirm diagnostics include prompt/completion/total tokens

If token-count payload validation fails:

1. verify formatter includes only schema-allowed fields/types
2. verify `cache_status` value is one of `hit|miss|unknown` or null
3. verify `usage_source` literal remains `provider|estimated`

If token counting becomes expensive:

1. inspect cache invalidation churn in `ConversationHistory`
2. inspect repeated fallback path usage from `TokenService` logs
3. inspect tool-output heavy turns for pruning-driven cache resets

## Related Pages

- [Backend Services Token Docs Hub](../services/token/README.md)
- [Token Service Message Normalization and Fallback Reference](../services/token/token_service_message_normalization_and_fallback_reference.md)
