---
summary: "Backend LLM provider docs sub-hub for base request/stream normalization contracts and provider-specific overrides across cloud/local runtimes."
read_when:
  - When changing `backend/src/llm/providers/*` request building, stream handling, or response normalization behavior.
  - When debugging provider-specific model prefixing, thinking flags, local model listing, or Kimi tool-call stream assembly.
title: "Backend LLM Provider Docs Hub"
---

# Backend LLM Provider Docs Hub

## Deep Pages

- [Base Request, Stream, and Normalization Reference](base_request_stream_and_normalization_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](provider_specific_overrides_and_local_runtime_reference.md)
- [Backend Kimi Provider Docs Hub](kimi/README.md)
- [Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference](kimi/stream_tool_call_aggregation_and_fail_closed_argument_parsing_reference.md)

## Code Scope

- `backend/src/llm/client.py`
- `backend/src/llm/providers/base.py`
- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/openrouter.py`
- `backend/src/llm/providers/anthropic.py`
- `backend/src/llm/providers/gemini.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/mistral.py`
- `tests/backend/test_llm_provider_base.py`
- `tests/backend/test_llm_client.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_kimi_coding_provider.py`
