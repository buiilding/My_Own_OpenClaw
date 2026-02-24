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
- [Provider Factory and Runtime Selection Reference](provider_factory_and_runtime_selection_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](parser_trust_boundary_and_native_tool_call_reference.md)
- [Base Request, Stream, and Normalization Reference](providers/base_request_stream_and_normalization_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](providers/provider_specific_overrides_and_local_runtime_reference.md)

## Code Scope

- `backend/src/llm/client.py`
- `backend/src/llm/models/*`
- `backend/src/llm/prompts/*`
- `backend/src/llm/parser*`
- `backend/src/llm/providers/*`
