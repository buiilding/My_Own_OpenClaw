---
summary: "Backend LLM provider base runtime reference: request param validation, message/tool schema normalization, stream event extraction, removed response_parsing thinking_extraction import relay behavior, removed provider tool-call id synthesis behavior, fail-closed missing tool_call_id semantics, removed choice text completion fallback behavior, canonical message.content completion parsing, and usage/cache diagnostics semantics."
read_when:
  - When changing `LLMProvider`/`OnlineLLMProvider` method contracts in `backend/src/llm/providers/base.py` and `online.py`.
  - When debugging malformed tool-calls, provider tool call id synthesis removal, missing provider tool_call_id fail-closed behavior, OpenAI Responses tool call id requirements, stream delta parsing, the removed `response_parsing` thinking-extraction import relay, choice-level completion text fallback behavior, OpenAI choice text fallback payloads, or cache diagnostics values on streamed turns.
  - When resolving choice text completion fallback routing for provider response parsing.
  - When resolving completion fallback choice text routing for provider response parsing.
title: "Base Provider Tool-Call ID and Normalization Reference"
---

# Base Provider Tool-Call ID and Normalization Reference

## Canonical Modules

- `backend/src/llm/client.py`
- `backend/src/llm/providers/base.py`
- `backend/src/llm/providers/base_payload_helpers.py`
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

This is the canonical route for the removed choice text completion fallback and
completion fallback choice text queries.

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
- `base_payload_helpers.py`: provider helper method surface for request normalization, response parsing, and thinking extraction, delegating directly to the extracted owner modules.
- `stream_event_pipeline.py`: stream-mode request flagging and shared text/thinking event emission loops.

Import boundary note:

- `response_parsing.py` no longer re-exports or relays
  `extract_thinking_content(...)` / `extract_tagged_thinking_from_content(...)`.
- thinking helpers are imported from `thinking_extraction.py` by consumers such
  as `base_payload_helpers.py`.
- stale searches for `response_parsing` thinking-extraction relay imports should
  route here.

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

- `LLMProvider` delegates message and tool-schema normalization helpers to `message_normalization.py` via `ProviderPayloadHelpersMixin`.

## Tool Schema Normalization Boundary

`_normalize_tools_for_litellm(...)` requires each entry:

- `type == "function"`
- `function.name` non-empty string
- `function.parameters` present and object
- optional `function.description` string when present

Any legacy or malformed shape fails closed with `LLMAPIError`.

Provider-specific compatibility note:

- OpenAI standard `chat.completions` tool transport rejects top-level schema combinators in `function.parameters` (`oneOf`, `anyOf`, `allOf`, `enum`, `not`) even when the root schema is an object.
- model-facing grouped tools should avoid those root combinators by construction; runtime Pydantic validation still enforces the exact action-specific payload after the model emits a tool call.

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
- base method clears request-scoped usage and normalized stream payload state before each stream starts.
- base method converts exceptions into `ErrorEvent` instead of raising.
- stream callers always consume events, never exception-based control flow.

Shared stream helpers live in `stream_event_pipeline.py`:

- `enable_stream_with_usage(...)` sets `stream=true` + `stream_options.include_usage=true`.
- `stream_text_content_events(...)` yields `ChunkEvent` from text deltas.
- `stream_thinking_and_text_events(...)` yields `ThinkingEvent` + `ChunkEvent`.

Implementation note:

- `LLMProvider` no longer exposes stream-helper compatibility wrappers; online providers call the pipeline helpers directly.

## Delta and Completion Payload Extraction

Key extraction helpers:

- `_extract_stream_delta(...)` supports dict/object chunk structures.
- `_extract_stream_finish_reason(...)` supports dict/object choice structures.
- `_extract_delta_content(...)` supports plain-string and block-list text content.
- `_extract_thinking_content(...)` (delegated to `thinking_extraction.py`) supports:
  - object fields (`reasoning_content`, `thinking`, `reasoning`, `thought`),
  - dict fields of same names,
  - nested list/dict reasoning payloads under those fields,
  - `<thinking>...</thinking>` tagged content.

Completion response normalization (`_extract_completion_response(...)`):

- reads `choices[0].message`,
- extracts textual content from strings, dicts, or text blocks,
- ignores choice-level completion `text`; provider responses must expose
  assistant text through `message.content` or the supported message text fields,
- parses tool calls from both:
  - OpenAI-style `message.tool_calls`,
  - Anthropic-style `content` blocks with `type=tool_use`,
- requires each provider tool call to include a non-empty id because
  `tool_call_id` is the join key for later `role=tool` messages,
- does not synthesize provider tool-call ids; missing ids from non-stream,
  streamed, or OpenAI Responses provider payloads fail closed instead of
  inventing join keys,
- collapses exact duplicate tool-call representations when a provider exposes
  the same call in multiple fields, then rejects any remaining duplicate
  normalized tool-call IDs in one assistant response,
- includes `finish_reason` when present.

Removed compatibility fallback:

- `choices[0].text` is not assistant content when `choices[0].message.content`
  is empty
- completion parsing does not backfill from choice-level text payloads
- providers must normalize assistant text into the canonical message payload
  before backend history or query-completion logic sees it

Tool-call argument normalization supports:

- dict directly,
- pydantic-like objects (`model_dump` / `dict`),
- JSON string decoding into object,
- rejects non-object decoded JSON and unsupported types.

Implementation note:

- completion/stream parsing helpers delegate to `response_parsing.py` through `ProviderPayloadHelpersMixin`; this keeps parser behavior reusable and testable outside the provider base runtime class.

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
- tool-call IDs must be unique within the response,
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
4. Stream helper/event contract changes can desynchronize SDK/renderer stream state machine assumptions.
