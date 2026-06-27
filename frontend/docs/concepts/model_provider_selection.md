---
summary: "Conceptual guide to WindieOS model provider selection, model catalog metadata, provider availability gates, local provider behavior, web-search fallback, and non-automatic failover boundaries."
read_when:
  - When changing provider selection, model listing, model catalog metadata, provider credentials, local provider discovery, or provider fallback semantics.
  - When debugging why a selected provider/model is unavailable, not listed, missing capabilities, or not falling back automatically.
title: "Model Provider Selection"
---

# Model Provider Selection

WindieOS separates model catalog metadata from provider runtime availability. A model card can exist in the catalog while a provider runtime is unavailable because credentials, base URL, or local service state is missing.

## Current Selection Path

1. Renderer settings choose model/provider options and send client settings to the backend.
2. Backend session config stores `model_provider`, model id, reasoning/search options, and provider credentials/base URLs.
3. `LiteLLMClient` resolves provider name from session config.
4. Provider factory registers only providers that can initialize.
5. Provider-specific code normalizes stream/non-stream responses into WindieOS payloads.
6. Renderer consumes model-list and settings ACK events from the backend.

## Provider Availability

Cloud providers require configured credentials before registration. Local providers can be registered without an API key, but they can still fail when their local runtime endpoint is down.

| Provider class | Availability gate |
| --- | --- |
| OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Kimi Coding | API key/config presence and constructor validation |
| Scripted | deterministic dev provider; selectable only when the desktop dev loop exposes it |
| Ollama, LM Studio | local base URL config; request-time availability depends on local server |
| OCR/vision/embedding providers | provider-specific health and circuit-breaker state can narrow prompt-visible capabilities |
| web search | native provider support or configured Brave fallback decides whether logical web search is shown |

## Failover Boundary

WindieOS currently has targeted fallback paths, not general automatic model failover.

Implemented fallback examples:

- local token counting falls back to coarse estimates when tokenizer counting fails.
- provider capability health can hide unavailable OCR/vision/embedding/web-search capabilities before prompting.
- web search can use Brave fallback when the active model provider lacks native web retrieval and `BRAVE_SEARCH_API_KEY` is configured.
- vision/TTS/local runtime components have specific device/runtime fallback paths documented in their service docs.

Do not imply that a failed LLM request automatically retries on another provider. If automatic failover is added, it needs explicit policy, user-visible settings, telemetry, provider compatibility rules, and tests.

## Change Rules

- Add provider runtime behavior in `backend/src/llm/providers/**`, not only in frontend model lists.
- Add model metadata in `backend/src/llm/models/models_config.py`.
- Update config loading and credential docs when a provider gets new env vars.
- Keep provider-specific response normalization inside provider/client layers before events reach the agent loop.
- Keep the scripted provider dev-only in the model picker. It may be routable in
  the backend for selected dev sessions, but it should not appear in packaged or
  customer starts.
- Treat automatic cross-provider retry as a product/runtime design change, not a small provider patch.

## Debug Routing

| Symptom | Start here |
| --- | --- |
| provider missing from available list | provider factory credential/config gates |
| model missing from UI | backend model service/catalog, model-list route/event, frontend model selector |
| provider streams malformed tool calls | provider-specific stream parser and normalized tool-call adapter |
| web search hidden | provider native capability plus Brave fallback config |
| local model listed but request fails | Ollama/LM Studio server availability and base URL config |
| settings appear saved but query uses old model | backend session config rewire and renderer settings ACK path |

## Deep Docs

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- Provider Credentials (private backend docs)
- [Inference Providers](../providers/inference.md)
- Backend Provider Factory and Runtime Selection Reference (private backend docs)
- Backend LLM Provider Docs Hub (private backend docs)
- Runtime Configuration Matrix (private backend docs)
