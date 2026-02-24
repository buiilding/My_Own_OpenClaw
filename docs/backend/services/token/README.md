---
summary: "Backend services token docs sub-hub for TokenService message normalization, LiteLLM counting behavior, fallback estimation rules, and singleton lifecycle."
read_when:
  - When changing `backend/src/services/token_service.py` normalization or fallback counting behavior.
  - When debugging token-count drift between provider usage diagnostics and local token estimates.
title: "Backend Services Token Docs Hub"
---

# Backend Services Token Docs Hub

## Deep Pages

- [Token Service Message Normalization and Fallback Reference](token_service_message_normalization_and_fallback_reference.md)

## Code Scope

- `backend/src/services/token_service.py`
- `backend/src/agent/llm/token_counting.py`
- `tests/backend/test_token_service_fallback.py`
- `tests/backend/test_conversation_history.py`
