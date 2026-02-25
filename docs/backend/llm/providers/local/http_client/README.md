---
summary: "Backend local provider HTTP-client docs sub-hub for async client singleton lifecycle, event-loop capture, and weakref finalizer cleanup behavior."
read_when:
  - When changing `LocalLLMProvider._get_http_client`, `_close_http_client`, or `_cleanup_http_client_finalizer`.
  - When debugging local provider connection churn, leaked sockets, or shutdown-time event loop cleanup warnings.
title: "Backend Local Provider HTTP Client Docs Hub"
---

# Backend Local Provider HTTP Client Docs Hub

## Deep Pages

- [Shared Async Client Lifecycle and Finalizer Cleanup Runtime Reference](shared_async_client_lifecycle_and_finalizer_cleanup_runtime_reference.md)

## Related Pages

- [Backend Local Provider Docs Hub](../README.md)
- [Model Listing, Connection Pooling, and Placeholder Key Reference](../model_listing_connection_pooling_and_placeholder_key_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](../../provider_specific_overrides_and_local_runtime_reference.md)

## Code Scope

- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/__init__.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_provider_factory_helpers.py`
