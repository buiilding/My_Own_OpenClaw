# Performance Notes (Current)

## Backend

- **Provider factory caching**: LLM providers are cached with `lru_cache` to avoid recreation (`backend/src/llm/providers/__init__.py`).
- **Conversation history**: History formatting uses cached access paths for O(1) retrieval in the agent pipeline (see session/history modules).
- **Tool result storage**: Centralized storage with TTL cleanup (`backend/src/agent/tools/waiting/storage/result_storage.py`).

## Frontend

- **Split contexts**: `AppConfigContext` vs `AppStatusContext` reduces re-renders.
- **Zustand store**: Chat state is store-driven and efficiently subscribed.
- **Lazy Settings Panel**: Settings UI is loaded lazily.

## Sidecar

- **Single capture after tool execution**: screenshots are captured once per tool/bundle to avoid redundant work.

## Tips

- Keep GPU-enabled OCR/vision configs on if available.
- Large screenshots increase WebSocket payload size; limit when possible.
