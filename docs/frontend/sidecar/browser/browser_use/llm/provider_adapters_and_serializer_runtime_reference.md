---
summary: "Deep reference for browser_use provider adapters and serializers: OpenAI chat+schema path, Gemini mode/retry behavior, Mistral compatibility path, and provider-specific message serialization contracts."
read_when:
  - When changing provider adapters in `llm/openai`, `llm/google`, or `llm/mistral`.
  - When debugging provider response parsing failures, retry policy behavior, or content serializer mismatches.
title: "Browser Use LLM Provider Adapters and Serializer Runtime Reference"
---

# Browser Use LLM Provider Adapters and Serializer Runtime Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/llm/openai/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/openai/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/google/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/google/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/mistral/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/mistral/schema.py`

## OpenAI Adapter (`openai/chat.py`)

`ChatOpenAI` wraps `AsyncOpenAI` and supports both plain and structured completions.

### Request shaping

- builds model params from optional fields (`temperature`, `top_p`, `seed`, penalties, token caps, etc.)
- reasoning-model detection enables `reasoning_effort` and removes incompatible params
- structured mode uses strict `response_format=json_schema` with schema from `SchemaOptimizer`
- optional `add_schema_to_system_prompt` appends schema text into first system message

### Response handling

- `_get_first_choice_or_raise` fail-closes when `choices` missing/empty
- `_get_usage` maps OpenAI usage into shared `ChatInvokeUsage`
- structured mode validates `choice.message.content` through `output_format.model_validate_json`

### Error mapping

SDK exceptions map into shared error classes:

- `RateLimitError -> ModelRateLimitError`
- `APIConnectionError` / `APIStatusError` / generic exceptions -> `ModelProviderError`

## OpenAI Serializer Contract (`openai/serializer.py`)

`OpenAIMessageSerializer` converts internal message/content-part models to OpenAI chat param dicts.

Conversion behavior:

- user content supports text + image parts
- system content supports text-only parts
- assistant content supports text/refusal/tool-calls
- list helpers serialize entire message batches in order

This serializer is reused by both OpenAI and Mistral adapters, establishing a shared baseline chat shape.

## Google Adapter (`google/chat.py`)

`ChatGoogle` wraps `google.genai` with support for text and structured output modes.

### Client and config behavior

- caches `genai.Client` instance in `_client`
- serializes messages via `GoogleMessageSerializer`
- supports `include_system_in_user` mode
- model-specific thinking config branching:
  - Gemini 3 Pro: `thinking_level`
  - Gemini 3 Flash: `thinking_level` or fallback budget
  - earlier models: budget-based thinking config

### Structured output behavior

- native structured mode sets `response_mime_type=application/json` and `response_schema`
- uses `_fix_gemini_schema(...)` to resolve refs and remove unsupported fields
- fallback structured mode appends JSON instructions into prompt text when native mode disabled

### Retry behavior

- retry loop with exponential backoff + jitter for configured retryable status codes
- wraps timeout/cancellation and common provider-status hints into `ModelProviderError` with inferred status codes

## Google Serializer Contract (`google/serializer.py`)

`GoogleMessageSerializer.serialize_messages(...)` returns `(contents, system_instruction)`.

Behavior highlights:

- optionally prepends system text into first user message
- maps assistant role to `model` role for Gemini
- converts image data urls into binary `Part.from_bytes(...)` payloads with mime type from image metadata
- preserves text/refusal material as text parts

## Mistral Adapter (`mistral/chat.py`)

`ChatMistral` sends direct HTTP requests to `/chat/completions` using `httpx`.

### Request and auth

- API key from explicit field or `MISTRAL_API_KEY`
- base url from config with optional `MISTRAL_BASE_URL` override
- shared OpenAI serializer used for message payload conversion

### Structured mode

- uses `response_format.json_schema` with `MistralSchemaOptimizer`-sanitized schema
- parses returned content text then validates against requested output model

### Error and usage mapping

- HTTP >=400 responses parsed into provider/rate-limit errors
- usage dict translated into `ChatInvokeUsage`
- non-empty choices are required; missing choices fail-closed

## Mistral Schema Compatibility (`mistral/schema.py`)

`MistralSchemaOptimizer` builds from common `SchemaOptimizer` output and strips unsupported keywords recursively:

- `minLength`
- `maxLength`
- `pattern`
- `format`

This keeps strict JSON-schema payloads accepted by Mistral's response-format endpoint.

## Related Docs

- [Browser Use LLM Base Protocol, Message Types, Schema Optimization, and Model Alias Factory Contract Reference](base_protocol_message_types_schema_optimization_and_model_alias_factory_contract_reference.md)
- [Browser Use Tools Action Model Surface and Input Schema Contract Reference](../tools/action_model_surface_and_input_schema_contract_reference.md)
