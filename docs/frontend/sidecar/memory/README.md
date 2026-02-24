---
summary: "Frontend sidecar memory docs sub-hub for summarizer cadence, watermark progression, and unsemanticized conversation-window batching behavior."
read_when:
  - When changing sidecar semantic summarization cadence or watermark progression logic.
  - When debugging why episodic transcript entries are or are not promoted to semantic memory.
title: "Frontend Sidecar Memory Docs Hub"
---

# Frontend Sidecar Memory Docs Hub

## Deep Pages

- [Summarizer Watermark and Conversation Batch Reference](summarizer_watermark_and_conversation_batch_reference.md)

## Code Scope

- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
