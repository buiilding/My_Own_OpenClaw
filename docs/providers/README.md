---
summary: "Providers hub for WindieOS LLM providers, model catalog, credentials, OCR/vision/embedding providers, STT, TTS, and web search capability."
read_when:
  - When adding or changing a model provider, inference provider, provider credential flow, or model catalog entry.
  - When debugging provider availability or capability gating.
title: "Providers Hub"
---

# Providers Hub

WindieOS has multiple provider classes:

- LLM providers for chat, reasoning, tool calls, and streaming.
- Model catalog entries for display, capabilities, thinking modes, and web-search support.
- Inference providers for OCR, vision, and embeddings.
- Audio providers for STT and TTS.
- Web-search providers and native provider capabilities.

## Provider Pages

- [Models and LLM Providers](models.md)
- [Provider Change Workflow](provider_change_workflow.md)
- [Model Catalog Change Workflow](model_catalog_change_workflow.md)
- [Provider Credentials](credentials.md)
- [Inference Providers](inference.md)
- [Inference Capability Change Workflow](inference_capability_change_workflow.md)
- [OpenAI Provider](openai.md)
- [Anthropic Provider](anthropic.md)
- [Gemini Provider](gemini.md)
- [OpenRouter Provider](openrouter.md)
- [Kimi Coding Provider](kimi_coding.md)
- [Mistral Provider](mistral.md)
- [Local Providers](local.md)

## Current LLM Providers

The backend provider factory registers:

- OpenAI
- Anthropic
- Gemini
- OpenRouter
- Mistral
- Kimi Coding
- Ollama
- LM Studio

## Provider-Specific Edit Routes

| Provider | Read first | Primary tests |
| --- | --- | --- |
| OpenAI | [OpenAI Provider](openai.md) | `tests/backend/test_openai_provider.py`, `tests/backend/test_web_search_capabilities.py` |
| Anthropic | [Anthropic Provider](anthropic.md) | `tests/backend/test_anthropic_provider.py`, `tests/backend/test_provider_native_reasoning.py` |
| Gemini | [Gemini Provider](gemini.md) | `tests/backend/test_gemini_provider.py`, `tests/backend/test_web_search_capabilities.py` |
| OpenRouter | [OpenRouter Provider](openrouter.md) | `tests/backend/test_openrouter_provider.py`, `tests/backend/test_models_config.py` |
| Kimi Coding | [Kimi Coding Provider](kimi_coding.md) | `tests/backend/test_kimi_coding_provider.py`, `tests/backend/test_provider_factory_helpers.py` |
| Mistral | [Mistral Provider](mistral.md) | `tests/backend/test_models_config.py`, `tests/backend/test_provider_factory_helpers.py` |
| Ollama/LM Studio | [Local Providers](local.md) | `tests/backend/test_local_llm_providers.py`, `tests/backend/test_model_service.py` |

Primary files:

- `backend/src/llm/providers/factory.py`
- `backend/src/llm/providers/*`
- `backend/src/llm/models/models_config.py`
- `backend/src/core/config/models.py`
- `backend/src/core/config/app_config.py`

## Deep Docs

- [Backend LLM Provider Docs Hub](../backend/llm/providers/README.md)
- [Backend Provider Factory + Runtime Selection Reference](../backend/llm/provider_factory_and_runtime_selection_reference.md)
- [LLM Integration](../architecture/llm_integration.md)

## Evidence Notes

- Provider changes need evidence from the selected provider runtime, normalized
  response handling, and user-visible error surface when failures occur.
- Do not infer provider policy from a UI label; inspect model catalog,
  capability filtering, and request payload selection.
