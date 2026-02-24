---
summary: "Backend runtime services and storage layers: vision, OCR, embeddings, artifacts, semantic APIs, and observability hooks."
read_when:
  - When changing OCR/vision behavior, embeddings, token counting, or artifact handling.
  - When tracing performance and capacity issues in backend runtime services.
title: "Services and Storage"
---

# Services and Storage

## Vision Service

Module:

- `services/vision/vision_service.py`

Responsibilities:

- Owns singleton configured vision model instance.
- Initializes asynchronously with lock-serialized init/unload operations.
- Selects provider implementation by model family (InternVL vs Venus).
- Exposes readiness/error state for startup diagnostics.

Operational notes:

- Includes explicit unload path for releasing GPU/system memory.
- Handles CUDA cache clearing best-effort.

## OCR Service

Module:

- `services/ocr/ocr_service.py`

Responsibilities:

- Provides OCR over base64 screenshots.
- Initializes RapidOCR with CUDA preference and CPU fallback.
- Tunes OCR params from `OCRConfig` and detected hardware capacity.
- Runs OCR work on background thread path to avoid blocking async loop.

Behavioral highlights:

- GPU-memory threshold based batch sizing.
- Explicit OCR availability and dependency failure handling.
- Normalizes OCR result fields before returning to callers.

## Embedding Provider

Module:

- `embeddings/embeddings.py:SentenceTransformerProvider`

Responsibilities:

- Loads sentence-transformer model asynchronously.
- Uses lock to prevent concurrent double model load.
- Supports cached single and batch embeddings via cache manager.
- Offloads blocking encode calls to thread executor in runtime.

Used by:

- `/api/embeddings` endpoint
- memory-layer retrieval and indexing workflows

## Token Counting Service

Module:

- `services/token_service.py:TokenService`

Responsibilities:

- Normalizes message role/content/tool-call payloads into LiteLLM-compatible shape.
- Calls `litellm.token_counter(..., use_default_image_token_count=True)` for primary token counting.
- Falls back to text-character heuristic (`chars // 4`) when LiteLLM counting fails.
- Exposes process-wide singleton accessor (`get_token_service`) with lock-guarded lazy init.

Used by:

- `agent/llm/token_counting.py` local token estimates in token-count event pipeline
- conversation-history token cache recompute/increment paths

Deep reference:

- `services/token/token_service_message_normalization_and_fallback_reference.md`

## Artifact Storage

Module:

- `services/artifacts/store.py:ArtifactStore`

Responsibilities:

- Receives uploaded image artifacts and stores on local disk.
- Enforces strict allowed content types and maximum bytes.
- Validates artifact IDs with safe pattern on retrieval.
- Supports artifact-to-base64 resolution for query/tool payload assembly.

API integration:

- `api/routes/artifacts.py`

## Semantic and Embedding APIs

### Semantic summarization

- `api/routes/memory/semantic.py`
- Summarization service integrates LLM summarization and fallback fact extraction.
- Strict request validation: user ID and bounded conversation list lengths.

### Embeddings

- `api/routes/memory/embeddings.py`
- Embedding generation for sidecar memory indexing/search.
- Includes health probe verifying provider operability.

## Eventing and Observability Primitives

Core modules:

- `core/infrastructure/bus.py` (event bus)
- `core/events/*` (internal and streaming events)
- `core/observability/trust_boundary_metrics.py` (boundary metrics)

Agent/runtime usage:

- publishes completion and memory-store events
- captures trust-boundary violations in parser/prompt layers

## Storage Model Summary

Backend persistent-ish storage responsibilities:

- Artifact blobs: local filesystem under configured artifact directory
- Config: Python module + in-memory runtime copy
- Session state: in-process memory by user/session
- Tool result pending/futures: in-process session-scoped structures

Frontend sidecar memory stores are separate and documented under frontend/sidecar docs.
