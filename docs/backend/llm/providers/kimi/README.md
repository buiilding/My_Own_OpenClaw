---
summary: "Kimi provider docs sub-hub for endpoint/model normalization, stream tool-call delta assembly, and fail-closed argument parsing behavior."
read_when:
  - When changing `backend/src/llm/providers/kimi_coding.py` request params or stream tool-call handling.
  - When debugging Kimi stream errors, prompt-cache-key forwarding, or malformed tool-call argument chunks.
title: "Backend Kimi Provider Docs Hub"
---

# Backend Kimi Provider Docs Hub

## Deep Pages

- [Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference](stream_tool_call_aggregation_and_fail_closed_argument_parsing_reference.md)

## Related Pages

- [Backend LLM Provider Docs Hub](../README.md)
- [Provider-Specific Overrides and Local Runtime Reference](../provider_specific_overrides_and_local_runtime_reference.md)
- [Base Request, Stream, and Normalization Reference](../base_request_stream_and_normalization_reference.md)

## Code Scope

- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/__init__.py`
- `tests/backend/test_kimi_coding_provider.py`
