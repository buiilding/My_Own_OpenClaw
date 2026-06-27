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
- Provider Credentials (private backend docs)
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
| OpenAI | [OpenAI Provider](openai.md) | private backend tests |
| Anthropic | [Anthropic Provider](anthropic.md) | private backend tests |
| Gemini | [Gemini Provider](gemini.md) | private backend tests |
| OpenRouter | [OpenRouter Provider](openrouter.md) | private backend tests |
| Kimi Coding | [Kimi Coding Provider](kimi_coding.md) | private backend tests |
| Mistral | [Mistral Provider](mistral.md) | private backend tests |
| Ollama/LM Studio | [Local Providers](local.md) | private backend tests |

Primary files:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation

## Deep Docs

- Backend LLM Provider Docs Hub (private backend docs)
- Backend Provider Factory + Runtime Selection Reference (private backend docs)
- [LLM Integration](../architecture/llm_integration.md)

## Evidence Notes

- Provider changes need evidence from the selected provider runtime, normalized
  response handling, and user-visible error surface when failures occur.
- Do not infer provider policy from a UI label; inspect model catalog,
  capability filtering, and request payload selection.
