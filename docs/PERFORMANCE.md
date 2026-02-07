---
summary: "Performance Notes (Current)"
read_when:
  - When working on performance or profiling.
---

# Performance Notes (Current)

## Backend

- **Provider factory caching**: LLM providers are cached with `lru_cache` to avoid recreation (`backend/src/llm/providers/__init__.py`).
- **Model catalog caching**: Static online/vision model catalogs are precomputed once and returned as defensive copies (`backend/src/llm/models/model_service.py`).
- **Parallel local model discovery**: `ollama` and `lmstudio` model listing now runs concurrently to reduce settings-load latency (`backend/src/llm/models/model_service.py`).
- **Conversation history**: History formatting uses cached access paths for O(1) retrieval in the agent pipeline (see session/history modules).
- **Tool result storage**: Centralized storage with TTL cleanup (`backend/src/agent/tools/waiting/storage/result_storage.py`).

## Frontend

- **Split contexts**: `AppConfigContext` vs `AppStatusContext` reduces re-renders.
- **Zustand store**: Chat state is store-driven and efficiently subscribed.
- **Lazy Settings Panel**: Settings UI is loaded lazily.
- **Voice audio encoding reuse**: shared PCM conversion helpers in `frontend/src/renderer/features/voice/utils/audioEncoding.ts` remove duplicate per-hook logic.
- **Gateway metadata prefix cache**: voice packet framing caches metadata prefixes by sample rate to avoid JSON/string encoding work on every audio chunk.
- **Chat hook selector subscriptions**: `useChatStream` and `useChatMessageSender` subscribe to store actions via selectors to avoid rerenders from unrelated state updates.
- **Chat store no-op updates**: `updateMessage` now preserves state identity when message IDs are missing, preventing unnecessary state churn.
- **Config startup dedupe**: `AppConfigProvider` skips disk-sync writes and backend settings updates when loaded config matches the in-memory config.

## Sidecar

- **Single capture after tool execution**: screenshots are captured once per tool/bundle to avoid redundant work.

## Tips

- Keep GPU-enabled OCR/vision configs on if available.
- Large screenshots increase WebSocket payload size; limit when possible.
