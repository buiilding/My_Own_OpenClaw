---
summary: "Frontend sidecar browser_use LLM docs sub-hub for message/type contracts, schema optimization rules, model alias factories, and OpenAI/Google/Mistral provider adapter runtime behavior."
read_when:
  - When changing `tools/browser/browser_use/llm/*` model/message/schema/provider code.
  - When debugging structured-output schema failures, provider-specific retry/error behavior, or message serialization differences across providers.
title: "Frontend Sidecar Browser Use LLM Docs Hub"
---

# Frontend Sidecar Browser Use LLM Docs Hub

## Deep Pages

- [Browser Use LLM Base Protocol, Message Types, Schema Optimization, and Model Alias Factory Contract Reference](base_protocol_message_types_schema_optimization_and_model_alias_factory_contract_reference.md)
- [Browser Use LLM Provider Adapters and Serializer Runtime Reference](provider_adapters_and_serializer_runtime_reference.md)

## Related Pages

- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
- [Frontend Sidecar Browser Use Browser Docs Hub](../browser/README.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](../tools/runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/llm/base.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/messages.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/exceptions.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/models.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/schema.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/views.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/_type_stubs.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/openai/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/openai/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/google/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/google/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/mistral/chat.py`
- `frontend/src/main/python/tools/browser/browser_use/llm/mistral/schema.py`
