---
summary: "Deep reference for `semantic_parser.py`: SUMMARY/FACTS extraction regex contracts, numbered/bulleted fact parsing behavior, and fallback bullet filtering semantics."
read_when:
  - When changing `parse_summarization_response` or `extract_fallback_facts` logic in `semantic_parser.py`.
  - When debugging missing summary/facts output caused by model formatting drift in semantic summarize responses.
title: "Semantic Parser Summary/Fact Extraction and Fallback-Bullet Contract Reference"
---

# Semantic Parser Summary/Fact Extraction and Fallback-Bullet Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic.py`
- `tests/backend/test_memory_routes.py`
- `tests/backend/test_semantic_parser_service.py`

## Parser Surface

`semantic_parser.py` exports:

- `parse_summarization_response(response_text) -> (summary, facts)`
- `extract_fallback_facts(response_text) -> facts`

Shared regex primitives:

- `_FACT_BULLET_PREFIX = (?:[-*]|\d+[.)])`
- `_FACT_LINE_PATTERN` captures one bullet item body per line

## Summary Extraction Contract (`parse_summarization_response`)

Summary regex behavior:

- accepts optional markdown prefix before `SUMMARY`:
  - `**SUMMARY`
  - `## SUMMARY`
- supports `SUMMARY:` and `SUMMARY` (optional colon)
- captures summary text until:
  - blank line
  - `FACTS:` marker
  - end of text
- strips captured summary text

If no summary match is found, summary remains `""`.

## FACTS Section Extraction Contract (`parse_summarization_response`)

Primary facts path:

- looks for explicit `FACTS:` section
- requires one or more bullet lines using `_FACT_BULLET_PREFIX`
- bullet formats accepted:
  - `- fact`
  - `* fact`
  - `1. fact`
  - `2) fact`

Secondary marker fallback inside parser:

- if strict facts-section pattern fails but `FACTS:` marker exists,
  parser scans all subsequent lines using `_FACT_LINE_PATTERN`

All captured facts are stripped; empty strings are dropped.

## Free-Form Fallback Facts Contract (`extract_fallback_facts`)

Used when summarize service gets empty facts from primary parser.

Behavior:

- scans entire response for bullet-like lines using `_FACT_LINE_PATTERN`
- keeps only facts with length `> 3` after trim
- drops very short/noisy entries (for example `ok`, `x`)

This fallback is format-tolerant and not tied to a `FACTS:` marker.

## Integration Boundary with Service

`SemanticSummarizationService.summarize(...)` flow:

1. primary parse: `parse_summarization_response(...)`
2. if summary empty -> service fallback summary from raw text prefix
3. if facts empty -> service fallback facts via `extract_fallback_facts(...)`

Parser functions intentionally do not raise on mismatched text shape.

## Test-Backed Invariants

`tests/backend/test_memory_routes.py` validates:

- markdown-style `**SUMMARY:**` parsing
- explicit `FACTS:` bullet extraction
- fallback-fact short-line filtering

`tests/backend/test_semantic_parser_service.py` validates:

- numbered fact lists (`1.`, `2)`) parse in primary path
- fallback fact extraction supports numbered + bulleted lines
- parser outputs integrate correctly with service fallback behavior

## Drift Hotspots

1. Tightening summary/facts regex too aggressively can break parsing for provider-specific markdown wrappers.
2. Removing numbered bullet support (`1.` / `2)`) can drop facts from otherwise valid model responses.
3. Lowering fallback fact length threshold can reintroduce low-signal entries into memory.
4. Making parser throw on malformed text can break semantic summarize endpoint stability.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference](semantic_title_generation_route_model_override_and_parser_fallback_contract_reference.md)
