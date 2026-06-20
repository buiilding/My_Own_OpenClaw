---
summary: "Performance Notes (Current)"
read_when:
  - When working on performance or profiling.
---

# Performance Notes (Current)

## Backend

- **Provider factory caching**: LLM providers are cached with `lru_cache` to avoid recreation (`backend/src/llm/providers/factory.py`).
- **Model catalog caching**: Static online/vision model catalogs are precomputed once and returned as defensive copies (`backend/src/llm/models/model_service.py`).
- **Parallel local model discovery**: `ollama` and `lmstudio` model listing now runs concurrently to reduce settings-load latency (`backend/src/llm/models/model_service.py`).
- **Conversation history**: History formatting uses cached access paths for O(1) retrieval in the agent pipeline (see session/history modules).
- **Per-turn cache diagnostics logs**: LLM requests now emit `[Cache Hint]` (prompt continuity: cold-start/append-only/prefix-mutated) and `[Provider Cache]` (provider-reported cache hit/miss + cached token counts when available) in backend logs (`backend/src/agent/llm/llm_stream_processor.py`, `backend/src/llm/providers/base.py`).
- **Tool result storage**: Centralized storage with TTL cleanup (`backend/src/agent/tools/waiting/storage/result_storage.py`).

## Frontend

- **Split contexts**: `AppConfigContext` vs `AppStatusContext` reduces re-renders.
- **Zustand store**: Chat state is store-driven and efficiently subscribed.
- **Lazy Settings Panel**: Settings UI is loaded lazily.
- **Voice audio encoding reuse**: shared PCM conversion helpers in `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts` remove duplicate per-hook logic.
- **Gateway metadata prefix cache**: voice packet framing caches metadata prefixes by sample rate to avoid JSON/string encoding work on every audio chunk.
- **Voice gateway control payload reuse**: `useVoiceMode` reuses pre-serialized `set_langs`/`start_over` JSON payloads instead of re-stringifying on each socket-open or utterance-end event.
- **Chat hook selector subscriptions**: `useChatStream` and `useChatMessageSender` subscribe to store actions via selectors to avoid rerenders from unrelated state updates.
- **Chat interface state selector consolidation**: `ChatInterface` now reads message/sending/thinking/token state via one shallow-equal selector instead of multiple independent store subscriptions.
- **ChatBox state selector consolidation**: `ChatBox` now reads message/sending/thinking state via one shallow-equal selector and uses shared presentation helpers for status/preview derivation.
- **Stable chat stream listener lifecycle**: `useChatStream` keeps backend event handlers/listener stable across model-config updates and reads transcript model metadata from refs, reducing IPC re-subscribe churn.
- **Chat send-path capture trimming**: `useChatMessageSender` now skips unused system-state capture during user-message send, reducing extra IPC work on each send.
- **Chat store no-op updates**: `updateMessage`, `setMessages`, `setIsSending`, `setThinkingStatus`, and `setTokenCounts` now preserve state identity when values are unchanged, preventing unnecessary state churn.
- **Config startup dedupe**: `AppConfigProvider` skips disk-sync writes and backend settings updates when loaded config matches the in-memory config.
- **Stable config update handlers**: `AppConfigProvider` now uses a live config ref for comparisons and memoizes provider value/callbacks to avoid stale closures and needless re-renders.
- **Bundle formatting dedupe**: SDK/main tool routing reuses normalized bundle result structures for both formatting and UI payload construction to avoid duplicate per-step mapping work.
- **Shared bundle tool invocation path**: bundled tool execution now uses the same invoker as single-tool execution, removing duplicated IPC arg shaping and keeping screenshot display-bounds injection behavior consistent.
- **Shared tool-output content extraction**: SDK/main tool routing reuses one output extraction path for single and bundled tool messages, removing duplicated branching and keeping output precedence consistent.
- **Shared tool-result payload builders**: SDK/main tool routing uses pure payload/status helpers to normalize backend dispatch payloads and bundle status calculations, reducing duplicate object-shaping logic.
- **Bundle runner helper reuse**: `runToolBundle` now uses shared timing/step helpers for success and failure paths, keeping per-step bookkeeping consistent and reducing duplicated loop logic.
- **Shared artifact image metadata normalization**: chat send, tool execution upload, and chat message rendering paths now use one image content-type/extension helper, reducing duplicate string parsing and keeping screenshot handling consistent.
- **Stable tool routing lifecycle**: SDK/main keeps one managed runtime across model-config updates and reads model metadata through runtime state, reducing service churn while preserving transcript attribution.
- **PlayerService cleanup hardening**: audio playback stop/cleanup now cancels active sources and invalidates stale playback callbacks to avoid race-driven queue continuation after stop.
- **GPU acceleration default-on for Electron UI**: frontend no longer forces software rendering by default. WindieOS supplies `WINDIE_FORCE_SOFTWARE_RENDERING` through the main host skin; set `WINDIE_FORCE_SOFTWARE_RENDERING=1` only as a fallback for GPU-driver-specific crashes.

## Sidecar

- **Single capture after tool execution**: screenshots are captured once per tool/bundle to avoid redundant work.
- **Bounded executor routing**: sidecar now uses split interactive/background executors, with interactive bound as loop default to prevent unbounded default-thread growth on macOS-heavy capture/state paths.
- **Lower-noise stderr forwarding**: Electron main now forwards local-runtime stderr lines by severity (`WARNING+` by default) with opt-in verbose pass-through via `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR=1`. Generic Electron hosts use the `AGENT_VERBOSE_LOCAL_RUNTIME_STDERR` helper default unless their host skin config maps another env key.
- **Quieter default local-runtime logging**: Python local runtime now defaults to `WARNING` logs and supports explicit override via `AGENT_LOCAL_RUNTIME_LOG_LEVEL`; `AGENT_SIDECAR_LOG_LEVEL` and WindieOS `WINDIE_SIDECAR_LOG_LEVEL` remain compatibility aliases.
- **Lazier browser startup path**: browser tool runtime imports are now deferred until first browser tool execution instead of sidecar boot.
- **No duplicate FAISS read at startup**: `LocalMemoryStore` no longer performs redundant sync+async FAISS index reads during initialization.
- **Safer/lighter startup vector sync**: `LocalMemoryStore` now ensures FAISS indices exist before embedding backfill and skips FAISS disk writes when startup sync made no vector changes.
- **Lean screenshot transport over local-runtime JSON-RPC**: the local-runtime Python screenshot implementation now returns temp file refs, and Electron main uploads those files to backend artifacts (`screenshot_ref`) before renderer tool handling, removing huge inline base64 JSON lines from the Python stdout hot path.
- **Large JSON-line parse off main thread**: Electron main now routes oversized local-runtime JSON-RPC lines (>=128KB) through worker-thread JSON parsing and drains them through a serialized queue, reducing main-thread parse spikes.

## Tips

- Keep GPU-enabled OCR/vision configs on if available.
- Large screenshots increase WebSocket payload size; limit when possible.
