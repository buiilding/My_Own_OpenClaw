---
summary: "Backend LLM docs sub-hub for provider/model selection, prompt-construction boundaries, and parser/tool-call extraction behavior."
read_when:
  - When changing provider integration, model selection rules, or prompt/parser contracts.
  - When debugging LLM response parsing and tool-call extraction behavior.
title: "Backend LLM Docs Hub"
---

# Backend LLM Docs Hub

## Deep Pages

- [LLM Models and Parsing](llm_models_and_parsing.md)
- [Provider Docs Hub](providers/README.md)
- [Prompt Docs Hub](prompts/README.md)
- [Provider Factory and Runtime Selection Reference](provider_factory_and_runtime_selection_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](parser_trust_boundary_and_native_tool_call_reference.md)
- [Base Request, Stream, and Normalization Reference](providers/base_request_stream_and_normalization_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](providers/provider_specific_overrides_and_local_runtime_reference.md)
- [Backend Kimi Provider Docs Hub](providers/kimi/README.md)
- [Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference](providers/kimi/stream_tool_call_aggregation_and_fail_closed_argument_parsing_reference.md)
- [Backend Local Provider Docs Hub](providers/local/README.md)
- [Model Listing, Connection Pooling, and Placeholder Key Reference](providers/local/model_listing_connection_pooling_and_placeholder_key_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Prompt Manager and System Prompt Lifecycle Reference](prompts/prompt_manager_and_system_prompt_lifecycle_reference.md)

## Code Scope

- `backend/src/llm/client.py`
- `backend/src/llm/client_response_normalization.py`
- `backend/src/llm/models/*`
- `backend/src/llm/prompts/*`
- `backend/src/llm/parser*`
- `backend/src/llm/providers/*`
