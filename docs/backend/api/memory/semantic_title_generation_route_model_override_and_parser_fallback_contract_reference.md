---
summary: "Deep reference for `/api/semantic/title`: request validation, session/global config resolution, model/provider override behavior, title-prompt assembly, parser normalization, and fallback/error semantics."
read_when:
  - When changing `GenerateTitleRequest`, `generate_conversation_title`, or `SemanticSummarizationService.generate_title`.
  - When debugging title outputs that stay `New chat`, override-model mismatch, or title route 500/503 behavior.
title: "Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference"
---

# Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/core/validation/validators.py`
- `backend/src/core/config/manager.py`
- `backend/src/llm/client.py`
- `tests/backend/test_memory_routes.py`
- `tests/backend/test_semantic_parser_service.py`

## Route Surface

Route:

- `POST /api/semantic/title`

Handler:

- `generate_conversation_title(request, container, session_manager)`

Response model:

- `GenerateTitleResponse { title: str, success: bool }`

On success, route always returns `success=true`.

## Request Validation Contract

`GenerateTitleRequest` enforces:

- `user_id`: required, min length 1, validated by shared `validate_user_id(...)`
- `user_message`: required, `1..32768` chars
- `assistant_message`: required, `1..32768` chars
- `model_id`: optional, max `256` chars
- `model_provider`: optional, max `128` chars

`validate_user_id(...)` rejects:

- empty/whitespace-only ids
- literal `default_user`

## Config Resolution and Override Contract

`SemanticSummarizationService.generate_title(...)` resolves effective config in this order:

1. active session config for exact `user_id` (`session_manager.get_session(user_id)`)
2. fallback to global `container.config`

Override behavior:

- when `model_provider_override` is present, service copies config and updates `model_provider`
- when `model_id_override` is present, service copies config and updates `selected_model_id`
- overrides are applied before LLM client construction

API key gate:

- if resolved `model_mode != "local"` and `api_key` missing, service calls `load_api_key_for_provider(...)`

## LLM Client and Prompt Contract

Client creation:

- service calls `get_llm_client(merged_config)`
- if client is missing -> `HTTPException(503, "LLM service not available")`

Title prompt assembly (`_build_title_prompt`):

- trims `user_message` and `assistant_message`
- caps each to first `4000` chars
- asks model for:
  - `2..6` words
  - plain text
  - no quotes
  - no trailing punctuation

Completion call:

- `llm_client.get_completion(selected_model_id, [{"role":"user","content":prompt}])`

## Parser and Fallback Contract

`_parse_title_response(response_text)`:

- accepts only string input; non-string -> empty
- takes first non-empty line
- strips heading/list/title prefixes:
  - markdown heading (`#...`)
  - bullet/number prefix (`-`, `*`, `1.`, `1)`)
  - `title:`
- strips wrapping quotes/backticks
- collapses repeated whitespace
- removes trailing punctuation (`.!?;:`)
- truncates to:
  - `TITLE_MAX_WORDS = 6`
  - `TITLE_MAX_CHARS = 48`

Fallback:

- if parsed title is empty, service returns `FALLBACK_TITLE = "New chat"`

## Error Semantics

Service behavior:

- re-raises explicit `HTTPException` unchanged
- wraps unexpected exceptions as:
  - `HTTPException(500, "Title generation failed: An internal error occurred")`

This preserves sanitized client-facing errors while keeping internal stack traces in server logs.

## Test-Backed Invariants

`tests/backend/test_memory_routes.py` validates:

- title route uses session config when session exists
- title route uses container config when session is missing
- model/provider override path selects override model id
- request validation rejects `default_user`

`tests/backend/test_semantic_parser_service.py` validates:

- title parser strips heading + `Title:` prefix and trailing punctuation
- service returns `FALLBACK_TITLE` for blank model output
- online mode API-key load path runs when key missing

## Drift Hotspots

1. Changing override application order can select wrong model/provider for title generation.
2. Weakening parser cleanup can leak markdown/list/punctuation artifacts into sidebar conversation labels.
3. Removing fallback-title behavior can expose blank titles that break resume/search UX assumptions.
4. Returning unsanitized exception messages can leak provider internals over HTTP.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
