---
summary: "Deep cross-layer reference for memory retrieval injection: main-process query payload tagging, sidecar search grouping and transcript pair synthesis, and backend user-query extraction boundaries."
read_when:
  - When changing memory retrieval injection behavior in `query_payload_builder.cjs`, `local_backend_memory_handlers.py`, `memory/operations.py`, or `memory/local_store.py`.
  - When debugging episodic retrieval results that contain user-only transcript snippets instead of paired `User + Assistant` interaction text.
  - When debugging why backend memory tags appear in prompt content but are not persisted as structured memory arrays.
title: "Memory Search Grouping and Transcript Pair Synthesis Contract Reference"
---

# Memory Search Grouping and Transcript Pair Synthesis Contract Reference

## Canonical Modules

- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/memory/local_store.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`
- `tests/sidecar/test_memory_operations.py`
- `tests/sidecar/test_local_store_search_pairing.py`
- `tests/backend/test_agent_executor_user_query_sanitization.py`

## End-to-End Retrieval Injection Path

1. Renderer sends `query` with optional `memory_retrieval_enabled`.
2. Main `prepareRendererQueryPayload(...)` normalizes the flag:
  - defaults to enabled when omitted
  - strips `memory_retrieval_enabled` from outbound backend payload
3. Main `buildQueryPayloadContent(...)`:
  - requests sidecar `search_memory(...)` when injection is enabled
  - appends `<episodic_memory>` and `<semantic_memory>` sections
  - always emits both tags while enabled, using `None` placeholders when empty
4. Backend stores rendered content in history as opaque text and extracts only `<user_query>` for `user_query_raw`.

## Main-Process Tag Injection Contract

`query_payload_builder.cjs` behavior:

- `resolveMemoryEnrichment(...)` calls:
  - `searchMemory(text, userId, 6, null, conversationRef, { episodic_limit=4, semantic_limit=2, semantic_min_score=0.20 })`
- memory tags are always present when retrieval injection is enabled:
  - `<episodic_memory> ... </episodic_memory>`
  - `<semantic_memory> ... </semantic_memory>`
- each entry is XML-escaped and rendered as `- <entry>` bullet lines.
- disabled injection (`memory_retrieval_enabled === false`) skips sidecar memory search and omits both memory tags.

## Sidecar `search_memory` Handler Pipeline

`LocalBackendMemoryHandlersMixin._handle_search_memory(...)`:

1. validate payload using `normalize_search_memory_payload(...)`
2. validate optional balanced retrieval settings (`limit`, `episodic_limit`, `semantic_limit`, `semantic_min_score`)
3. default mode:
  - build optional memory-type filter via `build_memory_filters(...)`
  - query store: `memory_store.search(query, user_id, filters, limit)`
4. balanced prompt-injection mode:
  - run separate episodic + semantic searches with independent limits
  - apply active-conversation exclusion to episodic results only
  - apply `semantic_min_score` to semantic results
5. normalize output text buckets via `group_memory_texts(...)`
6. return grouped shape:
  - `{ memories: { episodic: [...], semantic: [...] } }`

## Episodic Grouping Contract (`memory/operations.py`)

`group_memory_texts(results)` guarantees two output arrays: `episodic` and `semantic`.

Semantic path:

- low-signal semantic rows are dropped before prompt injection.
- semantic rows are kept only when at least one durable fact remains after filtering.

Episodic path (priority order):

1. prefer already paired interaction rows (`User: ...` + `Assistant: ...`) detected by:
  - metadata: `source="interaction_completed"` or `record_kind="interaction"`
  - or text heuristic containing both `"user:"` and `"assistant:"`
2. if no explicit interaction rows exist, attempt transcript synthesis via `synthesize_transcript_interaction_pairs(...)`
3. if synthesis yields no pairs, fallback to raw episodic transcript text rows

## Transcript Pair Synthesis Fallback

`synthesize_transcript_interaction_pairs(results)` behavior:

- only uses rows where `record_kind` resolves to `transcript`
- resolves fields from row first, then metadata fallback:
  - `conversation_id`, `role`, `message_index`, `record_kind`
- builds per-conversation user and assistant buckets
- sorts each bucket by:
  - numeric `message_index` ascending first
  - rows without index later
- pairs each user row with the first eligible assistant row:
  - if user index is known: first assistant with unknown index or strictly greater index
  - if user index is unknown: first assistant in sorted list
- consumes matched assistant rows (one assistant per user pair)
- formats final text with `format_interaction_memory(user_text, assistant_text)`:
  - `User: <sanitized text>`
  - `Assistant: <sanitized text>`

## Local Store Enrichment Layer (Before Handler Grouping)

`LocalMemoryStore.search(...)` also performs transcript pairing enrichment before handler grouping:

1. semantic search across episodic/semantic FAISS targets
2. sort by score, trim to top `limit`
3. when episodic search is enabled:
  - `_enrich_transcript_user_results_with_assistant_pairs(...)` rewrites transcript user rows
  - primary companion lookup queries SQLite for the next assistant transcript message in the same conversation (`message_index > user_index`)
  - fallback companion lookup uses assistant rows already present in top-k results
  - retrievable assistant message types are constrained to `"" | "llm-text" | "error"`
4. result count remains stable (row text rewritten in place; no extra rows appended)

Practical consequence:

- `group_memory_texts(...)` commonly receives already paired episodic rows.
- fallback transcript synthesis still protects quality when top-k returns mostly user-only transcript rows.

## Active Conversation Exclusion Ordering

Active conversation exclusion happens after local-store search and before grouping:

- sidecar filters out episodic rows with matching `conversation_id == exclude_conversation_id`
- this prevents current conversation echo from entering `<episodic_memory>` injection
- if no conversation id is provided, no exclusion is applied

## Backend Ingestion Boundary

Backend ingestion behavior for enriched query content:

- `AgentExecutor._resolve_raw_user_query(...)` parses only `<user_query>...</user_query>`
  - scans at most first `300_000` characters
  - uses last matching `<user_query>` block when multiple blocks exist
  - HTML-unescapes extracted text
  - falls back to raw query input when missing/empty
- `ConversationHistory` stores full rendered content (including memory tags) as model-facing text
- structured `StoredMessage.episodic_memory` / `StoredMessage.semantic_memory` are not auto-populated on standard query path

## Drift Hotspots

1. Removing or reordering sidecar fallback pairing can regress episodic injection quality back to user-only transcript snippets.
2. Changing assistant message-type allowlist in local-store enrichment without updating docs/tests can silently alter episodic pairing coverage.
3. Moving active-conversation exclusion after grouping can leak current-turn context back into injected memory tags.
4. Parsing memory tags into structured backend arrays without updating `PromptConstructor` and history docs can create dual-source drift between rendered content and structured fields.

## Related Pages

- [Query Payload and Relay Reference](../../main/query_payload_and_relay_reference.md)
- [Local Backend JSON-RPC Reference](../local_backend_jsonrpc_reference.md)
- [Memory IPC and RPC Mapping Reference](../../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation History and Prompt Context Runtime Reference](../../../backend/runtime/conversation_history_and_prompt_context_runtime_reference.md)
