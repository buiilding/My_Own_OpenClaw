---
summary: "Backend local provider docs sub-hub for placeholder-key request wiring, model-list endpoint behavior, and shared HTTP client lifecycle."
read_when:
  - When changing `backend/src/llm/providers/local.py` behaviors for Ollama or LM Studio.
  - When debugging local model discovery failures, timeout/resource churn, or provider request compatibility.
title: "Backend Local Provider Docs Hub"
---

# Backend Local Provider Docs Hub

## Deep Pages

- [Model Listing, Connection Pooling, and Placeholder Key Reference](model_listing_connection_pooling_and_placeholder_key_reference.md)
- [Local Provider HTTP Client Docs Hub](http_client/README.md)
- [Shared Async Client Lifecycle and Finalizer Cleanup Runtime Reference](http_client/shared_async_client_lifecycle_and_finalizer_cleanup_runtime_reference.md)

## Related Pages

- [Backend LLM Provider Docs Hub](../README.md)
- [Provider-Specific Overrides and Local Runtime Reference](../provider_specific_overrides_and_local_runtime_reference.md)
- [Provider Factory and Runtime Selection Reference](../../provider_factory_and_runtime_selection_reference.md)

## Code Scope

- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/__init__.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_provider_factory_helpers.py`
