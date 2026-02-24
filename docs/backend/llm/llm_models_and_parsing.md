---
summary: "Model/provider selection, provider factory caching, prompt construction trust boundary, and response parser enforcement."
read_when:
  - When changing provider integrations, model lists, prompt shaping, or parser validation.
  - When debugging tool-call extraction errors from model outputs.
title: "LLM Models and Parsing"
---

# LLM Models and Parsing

## LLM Client Abstraction

Main interface:

- `llm/client.py:LLMClient`
- concrete orchestrator: `LiteLLMClient`

Capabilities:

- completion and streaming completion APIs
- normalized response payloads (`content`, optional tool calls, finish reason)
- provider error normalization (`LLMAPIError`, `LLMRateLimitError`, generic `LLMError`)

`LiteLLMClient` delegates all provider behavior to factory-selected provider instances.

## Provider Factory and Caching

Factory module:

- `llm/providers/__init__.py`

Key behavior:

- Normalizes provider names and base URLs for stable cache keys.
- Uses bounded `lru_cache` keyed by primitive config values.
- Instantiates cloud providers only when API key is present.
- Always attempts local providers (`ollama`, `lmstudio`) independent of API key.

Supported provider classes include:

- OpenAI
- Anthropic
- Gemini
- Mistral
- OpenRouter
- Kimi Coding
- Ollama (local)
- LM Studio (local)

Provider base behavior is standardized in `llm/providers/base.py`.

## Model Discovery and Cataloging

Service:

- `llm/models/model_service.py:ModelService`

Static model catalogs:

- `llm/models/models_config.py`
- separate curated registries for online models, thinking-capable models, local vision models

Dynamic discovery:

- local providers queried asynchronously (`list_models`) and normalized
- dedup by `(provider, id)` while preserving first valid occurrence

## Prompt Construction Trust Boundary

Module:

- `llm/prompts/prompt_constructor.py`

Important behavior:

- Treats prompt construction as trust boundary with security limits from config.
- Filters tool schemas through centralized `ToolPolicy` before injection.
- Emits metadata for transparency events (`system-prompt`, `tool-schemas`, user full message context).
- Includes context XML extraction helpers for user message transparency payloads.
- Detailed prompt references:
- `llm/prompts/prompt_constructor_and_transparency_metadata_reference.md`
- `llm/prompts/prompt_manager_and_system_prompt_lifecycle_reference.md`

## Response Parsing Trust Boundary

Module:

- `llm/parser.py:ResponseParser`

Behavior:

- Enforces max response size and parse timeout.
- Uses executor-based parsing to avoid event-loop blocking.
- Uses robust JSON extraction utilities (`parser_extraction.py`) instead of brittle regex-only parsing.
- Validates tool call shapes and tool names via `ToolCallValidator`.

Outputs:

- `ParsedResponse` with text content + validated `ParsedToolCall[]`
- currently exercised by parser-focused tests and trust-boundary enforcement paths
- live interaction loop primarily consumes provider-native normalized `tool_calls` (see parser trust-boundary reference)

## Token Counting

Module:

- `services/token_service.py`

Behavior:

- Normalizes message/tool-call shapes for LiteLLM token counting.
- Supports multimodal content char counting fallback when token counter fails.
- Provides usage fallback estimation for degraded paths.

## Tool Schema Exposure to Model

Tool schemas are surfaced through:

- `tools/registry.py` (schema registry + declaration generation)
- `tools/tool_policy.py` (allowlist/dev filtering + coordinate-method gating)

This ensures model-visible tool surface is controlled by central policy, not ad-hoc callsites.
