---
summary: "Deep reference for Kimi stream internals: OpenAI/Anthropic tool-call delta merge, argument reconstruction, fail-closed JSON parsing, and normalized stream payload handoff."
read_when:
  - When changing Kimi stream chunk parsing, tool-call id synthesis, or normalized payload emission.
  - When debugging `ErrorEvent` output caused by malformed streamed tool-call arguments.
title: "Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference"
---

# Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference

## Canonical Modules

- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/streaming_tool_call_aggregation.py`
- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/base.py`
- `tests/backend/test_kimi_coding_provider.py`

## Request Wiring and Stream Param Surface

`KimiCodingProvider` derives from `OnlineLLMProvider` and reuses shared stream param building plus shared stream tool-call aggregation mixin logic.

Kimi-specific request behavior:

- default base URL: `https://api.kimi.com/coding`
- configured URLs ending with `/v1` are canonicalized by stripping `/v1`
- request params include `custom_llm_provider = "anthropic"`
- stream requests still inherit common transport options:
- `stream = true`
- `stream_options = { "include_usage": true }`
- forwarded completion kwargs (for example `prompt_cache_key`) pass through unchanged

## Model String Normalization

`_get_full_model_string(...)` mapping:

- `kimi-for-coding` -> `k2p5`
- `kimi-coding/<id>` -> `<id>`
- `kimi-code/<id>` -> `<id>`
- `anthropic/<id>` -> `<id>`
- any other value passes through

This keeps transport model IDs aligned to Kimi endpoint expectations while allowing compatibility aliases in user config.

## Delta Aggregation Sources

During `_stream_internal`, the provider accumulates tool-call fragments from two shapes in the same stream:

1. OpenAI-style `delta.tool_calls`
2. Anthropic-style `delta.content` blocks with `type = "tool_use"`

State is tracked per tool index in `tool_call_deltas` entries:

- `id`
- `name`
- `arguments_chunks` (string fragments)
- `arguments_obj` (already-parsed dict input)

Text and reasoning chunks are emitted live as:

- `ThinkingEvent` for reasoning content
- `ChunkEvent` for textual content

## Finalization and Fail-Closed Argument Parsing

At stream end, `_finalize_stream_tool_calls(...)` produces normalized tool-call entries:

- skips entries missing non-empty tool name
- synthesizes missing ids as `tool_call_<index>`
- uses `arguments_obj` directly when available
- otherwise joins `arguments_chunks` and normalizes via `_normalize_tool_arguments(...)`

Fail-closed behavior:

- malformed argument JSON raises `LLMAPIError`
- provider logs warning with bounded raw-argument preview
- `get_completion_stream` emits an `ErrorEvent` through base-class error mapping
- no normalized stream response payload is stored in this failure case

There is no fallback to `{}` for malformed streamed arguments.

## Normalized Payload Handoff

On successful stream completion, provider stores payload through `_set_last_stream_response_payload(...)` with:

- `content` (concatenated text chunks)
- optional `tool_calls` (normalized id/name/arguments list)
- optional `finish_reason`

`LLMStreamProcessor` later reads this payload through client/provider accessors to drive tool-turn orchestration.

## Test-Backed Invariants

`tests/backend/test_kimi_coding_provider.py` verifies:

- streaming tool-turn support capability flag returns true
- completion and stream requests include `custom_llm_provider = anthropic`
- stream path emits `ThinkingEvent` and `ChunkEvent` while assembling final tool calls
- malformed streamed tool-call arguments produce `ErrorEvent` and leave last stream payload unset
- stream params include usage options and preserve forwarded prompt cache key

## Drift Hotspots

1. removing dual-shape delta parsing can silently drop tool calls on provider format drift.
2. reintroducing argument parse fallback values can hide provider corruption and trigger unsafe tool execution.
3. omitting prompt cache key forwarding breaks cache-policy parity between completion and stream paths.

## Related Pages

- [Backend Kimi Provider Docs Hub](README.md)
- [Provider-Specific Overrides and Local Runtime Reference](../provider_specific_overrides_and_local_runtime_reference.md)
- [Base Request, Stream, and Normalization Reference](../base_request_stream_and_normalization_reference.md)
