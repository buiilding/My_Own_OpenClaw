---
summary: "Backend LLM provider base runtime reference: request param validation, message/tool schema normalization, stream event extraction, and usage/cache diagnostics semantics."
read_when:
  - When changing `LLMProvider`/`OnlineLLMProvider` method contracts in `backend/src/llm/providers/base.py` and `online.py`.
  - When debugging malformed tool-calls, stream delta parsing, or cache diagnostics values on streamed turns.
title: "Base Request, Stream, and Normalization Reference"
---

# Base Request, Stream, and Normalization Reference

## Canonical Modules

- `backend/src/llm/client.py`
- `backend/src/llm/providers/base.py`
- `backend/src/llm/providers/base_payload_compat_mixin.py`
- `backend/src/llm/providers/stream_event_pipeline.py`
- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/error_mapping.py`
- `backend/src/llm/providers/message_normalization.py`
- `backend/src/llm/providers/response_parsing.py`
- `backend/src/llm/providers/thinking_extraction.py`
- `backend/src/llm/providers/usage_diagnostics.py`
- `tests/backend/test_llm_provider_base.py`
- `tests/backend/test_llm_client.py`
- `tests/backend/test_llm_provider_utils.py`

## Call Path and Ownership

For backend query turns, provider execution is split across two layers:

1. `LiteLLMClient` resolves provider from config via `get_provider(...)`.
2. Provider builds LiteLLM params (`_build_request_params` and hooks).
3. Provider executes completion (`litellm.acompletion`) and normalizes response.
4. `LiteLLMClient` validates normalized payload again before returning to runtime loop.

`LiteLLMClient` is the caller-facing contract boundary; `LLMProvider` is the transport and payload normalization boundary.
Provider utility helpers now centralize shared logic:

- `error_mapping.py`: exception-chain walking, HTTP status extraction, API error message formatting.
- `message_normalization.py`: assistant/tool message normalization and canonical LiteLLM tool-schema validation.
- `response_parsing.py`: stream delta extraction, completion payload parsing, and tool-call argument normalization.
- `thinking_extraction.py`: reasoning/thinking delta parsing, including structured content blocks and `<thinking>` tags.
- `usage_diagnostics.py`: usage payload normalization/collection and stream cache diagnostics derivation.
- `base_payload_compat_mixin.py`: compatibility wrapper surface preserving historical `LLMProvider` helper methods while delegating to extracted modules.
- `stream_event_pipeline.py`: stream-mode request flagging and shared text/thinking event emission loops.

## Request Param Validation and Construction (`LLMProvider._build_request_params`)

Strict validation before any provider request:

- `model` must be non-empty `str`; `None`, non-string, or whitespace-only values raise.
- `messages` must be a `list`; non-list and `None` raise.
- core params always include:
  - `model` (possibly namespaced by provider prefix),
  - normalized `messages`,
  - `api_key`,
  - `base_url`,
  - `timeout`.

Optional param behavior:

- `tools`: validated canonical function schema list only.
- `tool_choice`, `parallel_tool_calls`: forwarded when not `None`.
- `prompt_cache_key`: stripped; empty string dropped.

Implementation note:

- completion/stream plumbing now accepts request options via `**request_kwargs` internally and normalizes through shared option extraction before request construction. External provider/client call semantics remain unchanged.

Provider-specific request mutation happens only via `_apply_provider_request_params(...)` hook.

## Message Normalization Boundary

`_normalize_messages_for_provider(...)` applies compatibility + safety rules:

- assistant `tool_calls` in internal shape `{id,name,arguments}` are converted to OpenAI function-call shape.
- OpenAI-shape tool calls with dict `function.arguments` are JSON-stringified.
- invalid assistant tool-call entries raise `LLMAPIError`.
- `role=tool` messages missing `tool_call_id` are dropped.
- orphan tool messages (no matching assistant `tool_calls` id) are dropped.

Primary reason: Anthropic-compatible endpoints can reject orphan/invalid tool message chains.

Implementation note:

- `LLMProvider` now delegates message and tool-schema normalization wrappers to `message_normalization.py` via `ProviderPayloadCompatMixin`.

## Tool Schema Normalization Boundary

`_normalize_tools_for_litellm(...)` requires each entry:

- `type == "function"`
- `function.name` non-empty string
- `function.parameters` present and object
- optional `function.description` string when present

Any legacy or malformed shape fails closed with `LLMAPIError`.

## Non-Stream Completion Error Mapping

`_get_completion_with_standard_errors(...)` maps LiteLLM/provider failures to canonical backend exceptions:

- `litellm.exceptions.RateLimitError` -> `LLMRateLimitError`
- `litellm.exceptions.APIError` -> `LLMAPIError` with extracted HTTP status when available
- unknown exceptions with detectable status code -> `LLMAPIError`
- unknown exceptions without status code -> `LLMError`

Status extraction walks exception cause/context chain and tries:

- direct `status_code`,
- nested `response.status_code`,
- regex parse from error text (`status/error code NNN`, `server error NNN`).

HTTP 520 has special message text (`upstream service temporarily unavailable`).

Implementation note:

- `LLMProvider` delegates this behavior to `error_mapping.extract_status_code(...)` and `error_mapping.build_api_error_message(...)` to keep error semantics shared and testable outside the large provider base module.

## Stream Contract and Event Emission

Public streaming entrypoint: `LLMProvider.get_completion_stream(...)`.

Contract:

- subclasses implement `_stream_internal(...)` and do not catch exceptions there.
- base method converts exceptions into `ErrorEvent` instead of raising.
- stream callers always consume events, never exception-based control flow.

Shared stream helpers:

- `_enable_stream_with_usage(...)` sets `stream=true` + `stream_options.include_usage=true`.
- `_stream_text_content_events(...)` yields `ChunkEvent` from text deltas.
- `_stream_thinking_and_text_events(...)` yields `ThinkingEvent` + `ChunkEvent`.

Implementation note:

- `LLMProvider` stream wrappers now delegate concrete loop logic to `stream_event_pipeline.py` while preserving compatibility method names in `base.py`.

## Delta and Completion Payload Extraction

Key extraction helpers:

- `_extract_stream_delta(...)` supports dict/object chunk structures.
- `_extract_stream_finish_reason(...)` supports dict/object choice structures.
- `_extract_delta_content(...)` supports plain-string and block-list text content.
- `_extract_thinking_content(...)` (delegated to `thinking_extraction.py`) supports:
  - object fields (`reasoning_content`, `thinking`, `reasoning`, `thought`),
  - dict fields of same names,
  - `<thinking>...</thinking>` tagged content.

Completion response normalization (`_extract_completion_response(...)`):

- reads `choices[0].message`,
- extracts textual content from strings, dicts, or text blocks,
- parses tool calls from both:
  - OpenAI-style `message.tool_calls`,
  - Anthropic-style `content` blocks with `type=tool_use`,
- deduplicates normalized tool calls by `(id,name)`,
- includes `finish_reason` when present.

Tool-call argument normalization supports:

- dict directly,
- pydantic-like objects (`model_dump` / `dict`),
- JSON string decoding into object,
- rejects non-object decoded JSON and unsupported types.

Implementation note:

- completion/stream parsing wrappers delegate to `response_parsing.py` through `ProviderPayloadCompatMixin`; this keeps parser behavior reusable and testable outside the provider base runtime class.

## Usage Capture and Cache Diagnostics

Usage capture path:

- stream chunks: `_record_stream_usage_from_chunk(...)`
- completion payloads: `_record_usage_from_payload_container(...)`

Accepted usage locations include:

- `usage`,
- `usage_metadata`,
- `usageMetadata`,
- `model_extra` nested equivalents.

`get_stream_cache_diagnostics(model)` returns normalized diagnostics:

- `status`: `hit` / `miss` / `unknown`
- `cache_hit`: bool/`None`
- token fields: cached, prompt, completion, thinking, total
- `reason`: set only on unknown cases

It extracts across provider variants (OpenAI, Anthropic, Gemini-style naming), with integer/string-number coercion.

Implementation note:

- `LLMProvider` now delegates usage normalization/collection and diagnostics shaping to `usage_diagnostics.py`, preserving existing output contract while reducing base-module responsibility.

## `LiteLLMClient` Cross-Checks

After provider returns, `LiteLLMClient` revalidates payload:

- `content` required and string (or `None` coerced to empty string),
- `tool_calls` must be list of `{id,name,arguments}` with strict types,
- `finish_reason` must be string or absent.

It also snapshots provider diagnostics/payload for downstream stream processor access:

- `get_last_stream_cache_diagnostics()`
- `get_last_stream_response_payload()`

## Test-Backed Invariants

`tests/backend/test_llm_provider_base.py` validates:

- request param validation and tool schema rejection behavior,
- assistant tool-call normalization + orphan tool-message dropping,
- thinking/delta/content extraction edge cases,
- stream finish-reason extraction on dict/object chunks,
- usage extraction and cache diagnostics (`hit/miss/unknown`),
- OpenAI + Anthropic tool-call response normalization.

`tests/backend/test_llm_client.py` validates:

- client-level normalized response contract,
- native tool-call preservation and parameter forwarding,
- defensive-copy behavior for captured stream payloads,
- capability check delegation via `supports_streaming_tool_turns`.

`tests/backend/test_llm_provider_utils.py` validates:

- extracted error/status helpers (`extract_status_code`, `build_api_error_message`),
- extracted usage helpers (`normalize_usage_payload`, `collect_usage_payload`, `extract_usage_int`, `build_stream_cache_diagnostics`).

## Drift Hotspots

1. Relaxing tool/message normalization allows malformed payloads that only fail at provider API boundary.
2. Skipping include-usage stream options breaks token-cache diagnostics silently.
3. Changing tool-call argument parsing semantics can break Anthropic `tool_use` ingestion.
4. Stream helper/event contract changes can desynchronize frontend stream state machine assumptions.
