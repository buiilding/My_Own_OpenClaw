---
summary: "Deep reference for semantic summarize flow: request/user validation, session-vs-global config resolution, API-key loading gate, prompt assembly, parser extraction, and fallback summary/facts behavior."
read_when:
  - When changing `summarize_conversations`, `SemanticSummarizationService`, or `semantic_parser` extraction logic.
  - When debugging empty summary/facts output, wrong model selection, or summarize route 500 responses.
title: "Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference"
---

# Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/core/validation/validators.py`
- `tests/backend/test_memory_routes.py`

## Request Validation Surface

`SummarizeRequest` enforces:

- `conversations` list length `1..100`
- each conversation max `32768` chars
- `user_id` validated through shared `validate_user_id(...)`

`validate_user_id(...)` rejects:

- empty/whitespace-only values
- `"default_user"`

## Route-to-Service Composition

`summarize_conversations(...)` composes service dependencies explicitly:

- `get_llm_client`
- `load_api_key_for_provider`
- `parse_summarization_response`
- `extract_fallback_facts`

Then calls `service.summarize(...)` and returns `SummarizeResponse(success=True)`.

## Effective Config Resolution Contract

`SemanticSummarizationService._resolve_effective_config(...)`:

1. check `session_manager.get_session(user_id)`
2. if session exists, use `session.cfg`
3. else use `container.config`

Important behavior:

- does not borrow config from other active users; only exact `user_id` session match is used.

## API-Key Loading Gate

Before client creation:

- if `model_mode != "local"` and `api_key` missing, service runs `load_api_key_for_provider(...)`

Then:

- build llm client via injected `get_llm_client(...)`
- if client missing, raise `HTTPException(503, "LLM service not available")`

## Prompt Assembly Contract

`_build_prompt(conversations)`:

- joins conversation texts with `\n\n---\n\n`
- requests response in strict sections:
  - `SUMMARY: ...`
  - `FACTS:` bullet list

Single completion call:

- `llm_client.get_completion(selected_model_id, [{"role":"user","content":prompt}])`

## Parser and Fallback Contract

Primary parse (`parse_summarization_response`):

- summary regex supports markdown `**` and `##` markers before `SUMMARY`
- facts extraction first targets explicit `FACTS:` section with `-`/`*` bullets
- secondary facts pass handles case where marker exists but strict section match fails

Fallbacks in service:

- empty summary -> first `500` chars (`FALLBACK_SUMMARY_LENGTH`) or fixed fallback text
- empty facts -> `extract_fallback_facts(...)` over full response
- fallback fact filter keeps bullet items with trimmed length > 3

## Error Semantics

Service re-raises explicit `HTTPException`.

Unexpected failures are sanitized to:

- `HTTPException(500, "Summarization failed: An internal error occurred")`

## Health Route Contract

`GET /api/semantic/health`:

- returns unhealthy when `container.llm_client` missing
- wraps check through `dependency_health_check(...)` (which delegates to `safe_health_check(...)`) to avoid thrown 500s on unexpected exceptions

## Test-Backed Matrix

`tests/backend/test_memory_routes.py` covers:

- summary/facts parse with markdown+facts headers
- fallback-fact extractor filtering short bullet lines
- session config preferred over global config for matching user
- global config used when request user has no active session (even if other sessions exist)
- semantic health route healthy/unhealthy and exception-wrapped behavior
- request validation rejects `"default_user"`

## Drift Hotspots

1. Changing regex groups can silently break summary/fact extraction and trigger fallback-heavy output.
2. Altering config resolution to use unrelated active sessions can leak cross-user model settings.
3. Removing sanitized 500 envelope can leak provider internals to clients.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
