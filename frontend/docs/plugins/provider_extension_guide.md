---
summary: "Provider extension guide for WindieOS LLM providers, model catalog entries, inference providers, credentials, and validation."
read_when:
  - When adding a model provider, updating model catalog metadata, or extending OCR, vision, embedding, STT, TTS, or web-search provider behavior.
  - When deciding whether provider work belongs in LLM providers, inference providers, credentials, or SDK routes.
title: "Provider Extension Guide"
---

# Provider Extension Guide

Use this page when a plugin-like request is actually a provider integration.

## LLM Provider Path

Core files:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation

Docs:

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- Provider Credentials (private backend docs)
- Backend LLM Provider Docs Hub (private backend docs)

Validation:

- provider factory registration tests
- model-list tests
- config/credential loader tests
- streaming/tool-call parsing tests for providers with custom stream behavior
- provider-specific docs and changelog entry

## Inference Provider Path

Use this for OCR, vision, embeddings, STT, TTS, or capability health.

Core files:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation

Docs:

- [Inference Providers](../providers/inference.md)
- [Inference Capability Change Workflow](../providers/inference_capability_change_workflow.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)
- [Security Hub](../security/README.md)

Validation:

- provider health tests
- router/circuit-breaker tests
- tool-output provider-error tests
- STT/TTS stream tests when audio providers change

## Credential Rules

- Use environment variables or explicit renderer-managed credential surfaces.
- Do not hardcode keys in provider classes, fixtures, docs, or generated examples.
- Keep install-auth tokens separate from provider credentials.
- Document required env vars in Provider Credentials (private backend docs) and Runtime Configuration Matrix (private backend docs) when applicable.

## Product Surface Rules

- Add model catalog metadata only for models the app can list and route correctly.
- Add capability flags when provider behavior affects visible controls or prompt/tool availability.
- Hide unavailable OCR/vision/embedding/web-search capabilities before prompt construction when the provider is disabled or unhealthy.
- Keep provider-native features such as reasoning, web search, or tool calls documented on the provider-specific page.

## Not a Provider

Do not use the provider path for:

- local filesystem/browser/computer actions: use local-runtime tools.
- hosted developer introspection routes: use SDK routes.
- dashboard UI-only behavior: use renderer feature docs.
- cron/webhook/scheduler behavior: use automation/planning docs.
