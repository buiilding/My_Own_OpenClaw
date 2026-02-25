---
summary: "Backend token calculation docs sub-hub for LiteLLM counter invocation, fallback char-to-token estimation heuristics, and assistant tool-call normalization contracts."
read_when:
  - When changing token estimation logic in `backend/src/services/token_service.py`.
  - When debugging local token-count drift caused by fallback estimation or malformed assistant tool-call payloads.
title: "Backend Token Calculation Docs Hub"
---

# Backend Token Calculation Docs Hub

## Deep Pages

- [Token Counter Invocation, Fallback Estimation, and Tool-Call Normalization Reference](token_counter_invocation_fallback_estimation_and_tool_call_normalization_reference.md)

## Related Pages

- [Backend Services Token Docs Hub](../README.md)
- [Token Service Message Normalization and Fallback Reference](../token_service_message_normalization_and_fallback_reference.md)
- [Token Count Event and Usage Diagnostics Reference](../../../runtime/token_count_event_and_usage_diagnostics_reference.md)

## Code Scope

- `backend/src/services/token_service.py`
- `backend/src/agent/llm/token_counting.py`
- `tests/backend/test_token_service_fallback.py`
