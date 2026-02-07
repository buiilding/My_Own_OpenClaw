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
- **Chat send-path capture trimming**: `useChatMessageSender` now skips unused system-state capture during user-message send, reducing extra IPC work on each send.
- **Chat store no-op updates**: `updateMessage`, `setMessages`, `setIsSending`, `setThinkingStatus`, and `setTokenCounts` now preserve state identity when values are unchanged, preventing unnecessary state churn.
- **Config startup dedupe**: `AppConfigProvider` skips disk-sync writes and backend settings updates when loaded config matches the in-memory config.
- **Stable config update handlers**: `AppConfigProvider` now uses a live config ref for comparisons and memoizes provider value/callbacks to avoid stale closures and needless re-renders.
- **Bundle formatting dedupe**: `ToolExecutionService` now reuses normalized bundle result structures for both formatting and UI payload construction to avoid duplicate per-step mapping work.
- **Shared bundle tool invocation path**: bundled tool execution now uses the same invoker as single-tool execution, removing duplicated IPC arg shaping and keeping screenshot display-bounds injection behavior consistent.
- **Shared tool-output content extraction**: `MessageFormatter` now reuses a single content/screenshot extraction path for single and bundled tool messages, removing duplicated branching and keeping output precedence consistent.
- **Shared tool-result payload builders**: `ToolExecutionService` now uses pure payload/status helpers to normalize backend dispatch payloads and bundle status calculations, reducing duplicate object-shaping logic.
- **Bundle runner helper reuse**: `runToolBundle` now uses shared timing/step helpers for success and failure paths, keeping per-step bookkeeping consistent and reducing duplicated loop logic.

## Sidecar

- **Single capture after tool execution**: screenshots are captured once per tool/bundle to avoid redundant work.

## Tips

- Keep GPU-enabled OCR/vision configs on if available.
- Large screenshots increase WebSocket payload size; limit when possible.
