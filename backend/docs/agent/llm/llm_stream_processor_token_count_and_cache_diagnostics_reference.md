---
summary: "Deep reference for LLM stream processing internals: stream vs native completion branching, normalized payload capture, cache-diagnostic logging, provider/estimated token accounting, and provider-specific prompt-cache key steering."
read_when:
  - When changing `LLMStreamProcessor.get_response` event flow, exception mapping, or tool-turn transport selection.
  - When debugging token-count mismatches, cache hint logs, Kimi prompt cache key behavior, or unsupported stream-event failures.
title: "LLM Stream Processor Token Count and Cache Diagnostics Reference"
---

# LLM Stream Processor Token Count and Cache Diagnostics Reference

## Canonical Modules

- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/retry_policy.py`
- `backend/src/agent/llm/stream_processor_helpers.py`
- `backend/src/agent/llm/token_counting.py`
- `backend/src/llm/providers/error_mapping.py`
- `backend/src/llm/request_kwargs.py`
- `backend/src/services/token_service.py`
- `tests/backend/test_llm_stream_processor.py`
- `tests/backend/test_llm_stream_processor_helpers.py`

## Core Event Lifecycle

`LLMStreamProcessor.get_response(...)` emits in this order:

1. streaming events from provider (`ChunkEvent`, optional `ThinkingEvent`, optional `ErrorEvent`)
2. `FullResponseEvent` after stream/non-stream completion
3. `TokenCountEvent` from `_count_tokens(...)`

On known failures:

- `LLMRateLimitError` -> emits user-friendly rate-limit `ErrorEvent`, then re-raises
- `LLMAPIError` -> emits mapped API error `ErrorEvent`, then re-raises
- any other exception -> emits generic LLM error `ErrorEvent`, then re-raises

Failure `ErrorEvent.metadata` includes a terminal stream-failure marker:

- `stream_failed: true`
- `terminal: true`
- `partial_response_emitted: true|false`
- `discard_partial_response: true|false`

When a provider emits one or more chunks and then fails validation, the already
emitted chunks are not retroactively hidden. Consumers must treat the terminal
error metadata as authoritative and avoid committing the partial assistant text
as a successful response.

## Transient Provider Retry

`LLMStreamProcessor` owns bounded retries for one provider sampling operation.
It does not replay the websocket query handler, user-message history admission,
the interaction loop, or tool execution.

Retry is allowed only when a provider failure is both:

- normalized as transient/retryable by provider metadata, such as HTTP `502`,
  `503`, `504`, or a pre-response transport timeout/reset
- emitted before any downstream-visible output, including assistant text,
  thinking, web-search progress, or tool execution

Initial policy:

- two total attempts
- one retry
- short bounded backoff
- metadata-first classification through `retry_policy.py`

Provider wrappers attach normalized fields to `ErrorEvent.metadata`:

- `provider`
- `status_code`
- `error_kind`
- `retryable`
- `transient`
- `retry_after_seconds`

OpenAI Responses `rate_limit_exceeded` stream failures may retry when provider
metadata marks them retryable and no downstream-visible output has been emitted;
provider retry-delay hints are honored when present. Context overflow stays on
the compaction recovery path, and recoverable tool-call format failures stay on
the synthetic tool-output correction path. If a retry succeeds, downstream
consumers see the normal successful stream. If retries are exhausted,
`InteractionLoop` sees one terminal error event and preserves its existing
failure semantics.

## Stream vs Native Completion Branching

Decision point:

- `_should_use_native_completion_path(tools, model_id)`

Rules:

- no tools -> always stream path
- with tools and no provider capability hook -> non-stream fallback
- with tools and capability hook returning false -> non-stream fallback
- with tools and capability hook returning true -> stream path

Purpose:

- preserve robust tool-turn support for providers that do not support streaming tool calls

## Request Kwargs and Tool Transport

Shared request kwargs are built once via `_build_completion_request_kwargs(...)`:

- model id
- message prompt
- tool transport kwargs from `build_tool_transport_kwargs(...)`
- optional `prompt_cache_key` for provider steering
- optional `previous_response_id` for OpenAI Responses continuation turns

Both stream and non-stream paths use this shared contract.

OpenAI continuation rule:

- `_resolve_previous_response_id(...)` only returns a value when:
  - provider is OpenAI
  - tools are enabled for the turn
  - the prompt currently ends in one or more `role=tool` messages
  - the previous normalized payload exposed `response_id`
- this keeps new user turns on the normal full-history path while letting OpenAI Responses continue native tool loops through `previous_response_id`

## Normalized Response Payload Capture

`_last_response_payload` stores normalized latest turn payload for parser bridge:

- non-stream path uses response dict from `get_completion_response`
- stream path merges `get_last_stream_response_payload()` when available from the active async request context
- if stream payload missing content, falls back to aggregated chunk text
- if client exposes no payload getter, fallback payload is `{"content": full_text}`

`get_last_response_payload()` returns copy to protect internal mutation.

`get_response(...)` is serialized per `LLMStreamProcessor` instance. The
processor owns session-scoped prompt fingerprints, latest normalized response
payload, and OpenAI `previous_response_id` continuation lookup, so overlapping
generators must not mutate those fields concurrently.

Normalized payload nuance:

- OpenAI Responses payloads can now persist `response_id` in addition to `content`, `tool_calls`, and `finish_reason`
- this is the token-safe continuation anchor used for later `previous_response_id` tool-output turns
- OpenAI Responses streaming may synthesize this payload from completed output items and function-call argument deltas when OpenAI omits the final `response.completed` or `response.incomplete` event
- OpenAI Responses missing-final-payload fallback logs include sanitized stream counters, event-type summaries, and bounded failure summaries for upstream `error` or `response.failed` events so production logs can distinguish empty streams, terminal events without a response object, reasoning-only streams, text-delta recovery, output-item recovery, and provider failure reasons without logging raw response content
- OpenAI Responses `response.failed` events with structured error details are also converted into provider metadata, so retryable rate-limit/server failures can use the pre-output retry path and `context_length_exceeded` can reach compaction recovery

Implementation note:

- stream event aggregation (`Chunk/Thinking/Error/FullResponse`), API-error message mapping, prompt fingerprinting, prompt-continuity classification, and payload normalization are delegated to `stream_processor_helpers.py`.

## Prompt Continuity and Cache Diagnostics

Two diagnostics channels are logged each turn:

1. prompt continuity hint (`[Cache Hint]`) based on message fingerprints:
- `cold_start`
- `append_only`
- `history_shortened`
- `prefix_mutated`
2. provider-reported cache diagnostics (`[Provider Cache]`) from client metadata

Provider stream usage and normalized response payloads are captured in request-local provider context. Missing request-local usage is reported as unavailable instead of reading stale cross-request provider state.

Fingerprint behavior:

- role + compacted content hash per message
- long strings compacted to head/tail with length marker before hashing
- list/dict content recursively compacted for stable comparison

Implementation note:

- `LLMStreamProcessor` calls shared helper functions directly and retains only logging/state responsibility for prompt-continuity diagnostics.

## Prompt Cache Key Steering (Provider-Specific)

`_resolve_prompt_cache_key()` only returns value for normalized provider `kimi-coding`.

Key precedence:

1. `session.runtime.active_conversation_ref` if non-empty
2. `session.session_id` fallback
3. `None` for non-Kimi providers

Used to improve prompt cache reuse across related tool turns.

## Token Accounting Model

`token_counting.count_tokens(...)` combines:

- local token-service estimates (`prompt`, visible output)
- provider diagnostics when available (`prompt/completion/total/thinking/cached/cache-hit/status`)
- conversation token count from history cache

Usage source decision:

- `"provider"` only if provider prompt/completion/total are all available
- otherwise `"estimated"`

Output totals:

- provider completion when available
- otherwise visible output + thinking tokens fallback

## Test-Backed Invariants

`tests/backend/test_llm_stream_processor.py` validates:

- prompt continuity statuses (`cold_start`, `append_only`, `prefix_mutated`) are logged
- provider cache diagnostics surface in logs
- unsupported stream event types raise `TypeError` and still emit `ErrorEvent`
- HTTP 520 maps to Kimi-specific retry message
- token event prefers provider usage + thinking tokens when available
- token event falls back to estimates when provider usage missing
- Kimi tool turns choose non-stream path when streaming tool turns unsupported
- Kimi/Gemini tool turns remain stream path when provider supports streaming tool turns
- Kimi prompt cache key prefers active conversation ref over session id
- Gemini tool turns with streaming support preserve normalized payload bridge (`finish_reason=tool_calls`) while still emitting thinking chunks.

`tests/backend/test_llm_stream_processor_helpers.py` validates:

- stream-event aggregation contract and unsupported-event rejection
- stream payload normalization fallback behavior
- prompt-cache key resolution precedence and provider gating
- fingerprint compaction and continuity-status classification

## Drift Hotspots

1. changing branch logic for tool turns can break providers with non-stream-only tool-call support.
2. losing normalized payload capture can break downstream parsed-response tool-call bridge.
3. removing hash compaction can inflate memory/log cost for image-heavy prompt messages.
4. changing provider usage precedence can skew token-count transparency and billing telemetry.
5. changing OpenAI `previous_response_id` gating can accidentally drop full-history context on fresh user turns or break Responses continuation loops such as native `web_search` follow-up turns.

## Related Pages

- [Backend Agent LLM Docs Hub](README.md)
- [Conversation Context and Event Presenter Prompt-Metadata Reference](conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [Token Count Event and Usage Diagnostics Reference](../../runtime/token_count_event_and_usage_diagnostics_reference.md)
- [Provider Factory and Runtime Selection Reference](../../llm/provider_factory_and_runtime_selection_reference.md)
