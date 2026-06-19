---
summary: "Backend memory guide covering active conversation history, rehydrate services, memory routes, embedding providers, and semantic parser behavior."
read_when:
  - When changing backend conversation history, rehydrate handling, memory HTTP routes, embeddings, semantic summarization, or title generation.
  - When debugging backend history drift, tool-call linkage, memory route failures, or embedding provider errors.
title: "Backend History and Semantic Routes"
---

# Backend History and Semantic Routes

The backend owns active model-facing history and hosted semantic/embedding routes. It does not own renderer transcript storage or local-runtime memory files.

## Code Ownership

| Concern | Files |
| --- | --- |
| Active conversation history | `backend/src/agent/history`, `backend/src/agent/llm/conversation_context.py` |
| Rehydrate handler | `backend/src/api/handlers/rehydrate.py` |
| Rehydrate services | `backend/src/api/services/rehydrate_entry_normalization.py`, `rehydrate_execution.py`, `rehydrate_tool_call_normalization.py`, `rehydrate_tool_linkage.py`, `rehydrate_transparency_resolution.py` |
| Memory routes | `backend/src/api/routes/memory` |
| Embedding providers | `backend/src/embeddings`, `backend/src/core/inference/embedding_router.py` |
| Memory container | `backend/src/core/container/memory_container.py` |

## Active History

Backend active history is optimized for model execution:

- prompt context,
- user/assistant messages,
- tool calls,
- tool outputs,
- token/cache accounting,
- compaction.

Do not assume every renderer transcript row should become a backend history row without normalization. Rehydrate is the explicit boundary.

## Rehydrate Boundary

Rehydrate services normalize stored transcript entries before backend use:

- entry shape,
- tool-call payloads,
- tool-output linkage,
- transparency payloads,
- missing/legacy fields.

When fixing replay continuation, prefer rehydrate tests over renderer-only assertions.

## Semantic And Embedding Routes

Backend memory routes support local-runtime remote clients for:

- embeddings,
- semantic summarization,
- conversation title generation,
- health checks.

Provider availability and error normalization live in backend embedding/provider
services. Local-runtime callers should receive sanitized route errors rather
than backend stack traces.

## Tests

```bash
<windie> test backend tests/backend/test_conversation_history.py tests/backend/test_rehydrate_execution_service.py -q
<windie> test backend tests/backend/test_rehydrate_tool_call_normalization.py tests/backend/test_rehydrate_tool_linkage.py tests/backend/test_rehydrate_transparency_resolution.py -q
<windie> test backend tests/backend/test_memory_routes.py tests/backend/test_embeddings_service.py tests/backend/test_remote_embedding_provider.py tests/backend/test_semantic_parser_service.py -q
```
