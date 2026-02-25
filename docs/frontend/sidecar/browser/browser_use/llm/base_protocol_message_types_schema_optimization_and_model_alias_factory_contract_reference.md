---
summary: "Deep reference for browser_use LLM shared contracts: base chat protocol shape, message/content part models, invoke result envelopes, schema optimizer strictness behavior, and model-alias factory resolution."
read_when:
  - When changing shared types in `llm/base.py`, `llm/messages.py`, `llm/views.py`, or `llm/schema.py`.
  - When debugging dynamic model alias resolution, strict schema generation behavior, or cross-provider typed invoke contracts.
title: "Browser Use LLM Base Protocol, Message Types, Schema Optimization, and Model Alias Factory Contract Reference"
---

# Browser Use LLM Base Protocol, Message Types, Schema Optimization, and Model Alias Factory Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/llm/base.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/messages.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/views.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/schema.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/models.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/exceptions.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/_type_stubs.py`

## Base Protocol Contract (`BaseChatModel`)

`BaseChatModel` is a runtime-checkable protocol with typed overloads for `ainvoke(...)`:

- `ainvoke(messages, output_format=None) -> ChatInvokeCompletion[str]`
- `ainvoke(messages, output_format=ModelType) -> ChatInvokeCompletion[ModelType]`

The protocol also exposes:

- `provider`
- `name`
- `model` / `model_name`

Pydantic integration:

- custom `__get_pydantic_core_schema__` returns `any_schema()` so protocol-typed fields remain storable in Pydantic models.

## Message Model Surface (`messages.py`)

Message/content dataclasses mirror OpenAI-oriented chat semantics while staying provider-agnostic in caller code.

### Content parts

- `ContentPartTextParam`
- `ContentPartImageParam` with `ImageURL(url, detail, media_type)`
- `ContentPartRefusalParam`

### Message envelopes

- `UserMessage`
- `SystemMessage`
- `AssistantMessage` (supports `tool_calls` and optional refusal)

Shared traits:

- `cache` field is retained for provider-specific caching hints
- `.text` helper normalizes either string content or content-part arrays into text

Tool-call structure:

- `ToolCall` contains string `id`, `type='function'`, and nested `Function(name, arguments_json_string)`

## Invoke Result Envelope (`views.py`)

`ChatInvokeCompletion[T]` wraps provider completion output with:

- `completion`
- optional `thinking` / `redacted_thinking`
- `usage` (`ChatInvokeUsage`)
- `stop_reason`

`ChatInvokeUsage` normalizes token accounting fields across providers, including optional cache/image token fields.

## Error Contract (`exceptions.py`)

Error hierarchy:

- `ModelError`
- `ModelProviderError(message, status_code=502, model)`
- `ModelRateLimitError(..., status_code=429, ... )`

Provider adapters map upstream SDK/HTTP errors into these classes so higher layers can treat provider failures consistently.

## Schema Optimization Contract (`schema.py`)

`SchemaOptimizer.create_optimized_json_schema(...)` performs aggressive flattening and strict-mode shaping:

- resolves `$ref` by inlining `$defs`
- drops metadata noise (`$defs`, many titles)
- keeps required validation fields and full descriptions
- sets `additionalProperties: false` on object nodes
- `_make_strict_compatible` marks all object properties as required for strict structured output mode

Optional compatibility knobs:

- `remove_min_items`
- `remove_defaults`

`create_gemini_optimized_schema(...)` currently returns the same optimizer output and preserves explicit required semantics.

## Model Alias Factory and Provider Resolution (`models.py`)

`get_llm_by_name(model_name)` creates provider adapters from alias names like `provider_model_name`.

Key behavior:

- provider aliases normalized (`kimi_code` -> `kimi_coding`)
- model-part normalization maps common names to dashed variants (`gpt_4o` -> `gpt-4o`, etc.)
- OpenAI-compatible providers share `_build_openai_compatible(...)` with provider-specific api key/base-url env precedence
- direct Mistral and Google adapters supported with provider-specific env keys

Module-level `__getattr__` lazily resolves:

- adapter classes (`ChatOpenAI`, `ChatGoogle`, `ChatMistral`)
- configured alias constants (for example `openai_gpt_5`, `google_gemini_2_5_flash`)

## TYPE_CHECKING Import Surface

`_type_stubs.py` centralizes type-only imports of broader Browser Use provider classes to keep static typing surfaces available without runtime import side effects.

## Related Docs

- [Browser Use LLM Provider Adapters and Serializer Runtime Reference](provider_adapters_and_serializer_runtime_reference.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](../tools/runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)
