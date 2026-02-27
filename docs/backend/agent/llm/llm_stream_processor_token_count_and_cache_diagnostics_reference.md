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
- `backend/src/agent/llm/stream_processor_helpers.py`
- `backend/src/agent/llm/token_counting.py`
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

Both stream and non-stream paths use this shared contract.

## Normalized Response Payload Capture

`_last_response_payload` stores normalized latest turn payload for parser bridge:

- non-stream path uses response dict from `get_completion_response`
- stream path merges `get_last_stream_response_payload()` when available
- if stream payload missing content, falls back to aggregated chunk text
- if client exposes no payload getter, fallback payload is `{"content": full_text}`

`get_last_response_payload()` returns copy to protect internal mutation.

Implementation note:

- stream event aggregation (`Chunk/Thinking/Error/FullResponse`) and payload normalization are delegated to `stream_processor_helpers.py`.

## Prompt Continuity and Cache Diagnostics

Two diagnostics channels are logged each turn:

1. prompt continuity hint (`[Cache Hint]`) based on message fingerprints:
- `cold_start`
- `append_only`
- `history_shortened`
- `prefix_mutated`
2. provider-reported cache diagnostics (`[Provider Cache]`) from client metadata

Fingerprint behavior:

- role + compacted content hash per message
- long strings compacted to head/tail with length marker before hashing
- list/dict content recursively compacted for stable comparison

Implementation note:

- continuity classification (`cold_start`/`append_only`/`history_shortened`/`prefix_mutated`) is computed in shared helper logic, with `LLMStreamProcessor` retaining logging responsibility.

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

## Related Pages

- [Backend Agent LLM Docs Hub](README.md)
- [Conversation Context and Event Presenter Prompt-Metadata Reference](conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [Token Count Event and Usage Diagnostics Reference](../../runtime/token_count_event_and_usage_diagnostics_reference.md)
- [Provider Factory and Runtime Selection Reference](../../llm/provider_factory_and_runtime_selection_reference.md)
