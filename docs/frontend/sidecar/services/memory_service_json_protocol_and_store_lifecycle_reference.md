---
summary: "Deep reference for standalone memory_service runtime: line-delimited JSON request protocol, search/store dispatch semantics, payload validation, request-loop shutdown behavior, and signal forwarding contracts."
read_when:
  - When changing `memory_service.py` request schema, search/store behavior, or main loop shutdown semantics.
  - When debugging memory-only service invalid-request handling, JSON parse failures, or stdin read-loop shutdown.
title: "Memory Service JSON Protocol and Store Lifecycle Reference"
---

# Memory Service JSON Protocol and Store Lifecycle Reference

## Canonical Modules

- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/core/runtime_shutdown.py`
- `frontend/src/main/python/core/stdout_json.py`
- `tests/sidecar/test_memory_service.py`

## Service Role

`MemoryService` is a minimal memory-only process:

- no tool execution
- no system-state collection
- simple request/response JSON protocol over stdin/stdout

It exists as a lightweight alternative to full `local_backend.py`.

## Request and Response Contract

Request shape:

```json
{
  "id": "request-id",
  "type": "search" | "store",
  "payload": {}
}
```

Response shape:

```json
{
  "id": "request-id-or-unknown",
  "success": true | false,
  "data": {},
  "error": "..."
}
```

Validation rules in `handle_request(...)`:

- request must be object
- payload must be object when provided
- unknown request type returns explicit failure message

## Search Path (`handle_search`)

Input defaults:

- `user_id = "default_user"`
- `limit = 5`
- optional `memory_type`

Behavior:

1. require non-empty string `query` (trimmed)
2. validate/normalize optional `memory_type` (`episodic|semantic`, case-insensitive)
3. reject non-string `memory_type`
4. build filters via `build_memory_filters(memory_type)`
5. call `memory_store.search(query, user_id, filters, limit)`
6. group result texts with `group_memory_texts(...)`
  - episodic grouping prefers interaction-style `User + Assistant` rows, then transcript pair synthesis fallback, then raw episodic fallback
7. return grouped episodic/semantic memories

Failure behavior:

- catches and wraps exceptions as `"Memory search failed: ..."`

## Store Path (`handle_store`)

Required fields:

- `user_query`
- `assistant_response`

Validation detail:

- uses shared `memory.operations.normalize_store_memory_payload(...)` so `memory_service.py` and `local_backend.py` enforce the same contract
- `user_query` and `assistant_response` must be strings; non-string payloads fail fast
- both fields are trimmed; whitespace-only values are rejected as missing

Defaults:

- `memory_type = "episodic"`
- `user_id = "default_user"`
- optional `session_id`

Validation detail:

- `memory_type` must be a string when provided
- `memory_type` is normalized to lowercase and must be `episodic` or `semantic`

Behavior:

1. delegate persistence to shared `memory.operations.store_interaction_memory(...)`
2. helper formats content + builds metadata + writes `record_kind="interaction"` row
3. return `memory_id` and stored type

## Main Loop and Framing

`run()` loop:

- reads one line at a time from stdin using `asyncio.to_thread(sys.stdin.readline)`
- ignores blank lines
- parses JSON request per line
- writes one JSON response line via `write_json_line(...)`

Error mapping:

- JSON decode errors return `id="unknown"` invalid-json error payload
- generic processing errors return error payload, using parsed request id when available

## Initialization and Shutdown

Startup:

- initializes `LocalMemoryStore` in `initialize()`
- registers SIGINT/SIGTERM handlers via shared runtime shutdown helper in `main()`

Shutdown path:

- `request_shutdown(...)` delegates to `request_stdin_shutdown(...)`
- sets running false + `_shutdown_requested`
- closes stdin to unblock read loop
- `shutdown()` closes memory store and logs completion

Signal routing:

- module-level `_active_service` used by `signal_handler(...)` to forward signal to service

## Test-Backed Invariants

`tests/sidecar/test_memory_service.py` verifies:

- search grouping and default filter/limit behavior
- search/store error wrapping
- store payload formatting and metadata construction
- dispatch routing for `type=search|store`
- rejection for non-object request/payload
- unknown request type handling
- signal handler forwarding to active service
- request-shutdown stdin close behavior and shutdown flags

## Drift Hotspots

1. changing line-based framing to multi-line payloads breaks current stdin parsing assumptions.
2. removing payload type checks can move request-shape failures deeper into memory store calls.
3. bypassing shared shutdown helper can leave blocking stdin read loop active during signal shutdown.
4. changing grouped memory response shape can break callers expecting `{ memories: { episodic, semantic } }`.

## Related Pages

- [Frontend Sidecar Services Docs Hub](README.md)
- [Sidecar Service Protocol Docs Hub](protocols/README.md)
- [Memory JSONL and Wakeword Binary Frame Contract Reference](protocols/memory_jsonl_and_wakeword_binary_frame_contract_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
- [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](../memory/memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md)
- [Frontend Sidecar Memory Storage Docs Hub](../memory/storage/README.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](../memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
