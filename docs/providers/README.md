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
- [Provider Credentials](credentials.md)
- [Inference Providers](inference.md)

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

Primary files:

- `backend/src/llm/providers/__init__.py`
- `backend/src/llm/providers/*`
- `backend/src/llm/models/models_config.py`
- `backend/src/core/config/models.py`
- `backend/src/core/config/app_config.py`

## Deep Docs

- [Backend LLM Provider Docs Hub](../backend/llm/providers/README.md)
- [Backend Provider Factory + Runtime Selection Reference](../backend/llm/provider_factory_and_runtime_selection_reference.md)
- [LLM Integration](../architecture/llm_integration.md)
