---
summary: "Desktop client contract map across renderer IPC channels, main-process handlers, SDK local-runtime callers, local-runtime JSON-RPC methods backed by local-runtime Python modules, and backend stream/tool payload boundaries."
read_when:
  - When changing renderer/main/SDK local-runtime/local-runtime Python implementation contracts for query, tool, memory, or voice flows.
  - When debugging IPC mismatch, missing event handling, or Python JSON-RPC payload drift.
title: "Frontend IPC and Local-Runtime Contract Touchpoints Reference"
---

# Frontend IPC and Local-Runtime Contract Touchpoints Reference

This reference maps renderer, Electron main, SDK local-runtime, local-runtime Python implementation, and backend contract boundaries with their paired modules.

## Renderer <-> Main IPC Touchpoints

| Renderer owner | Main owner | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| IPC bridge wrappers | IPC handlers | `renderer/infrastructure/ipc/{bridge,channels}.ts`, `main/ipc.cjs` | Invoke/send fails, unknown channel errors |
| Query send API | Backend relay path | `renderer/app/runtime/desktopRuntimeTransport.ts`, `main/ipc.cjs` | Query never sent or missing ACK gating |
| Overlay controls | Overlay handlers | Renderer overlay listeners + `main/overlay_*_handler.cjs` | Chatbox/response overlay misbehavior |
| Wakeword toggle/events | Wakeword bridge lifecycle | Voice hooks + `main/wakeword_bridge.cjs` + `main/wakeword_bridge_runtime.cjs` | No detection or duplicate wakeword triggers |

## Main <-> Backend WebSocket Touchpoints

| Main owner | Backend pair | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| Outgoing message relay | Incoming schemas/routes | `main/ipc.cjs`, backend `api/schemas/incoming.py` | Backend validation errors |
| Inbound event rebroadcast | Outgoing schemas/formatters | `main/ipc.cjs`, backend `api/schemas/outgoing.py` | Renderer drops events |
| Settings ACK gating | Settings handlers | `main/ipc.cjs`, backend `api/handlers/settings.py` | First-query sync race or stale config |
| Conversation/session refs | Query/rehydrate handlers | `main/ipc.cjs`, backend query/rehydrate services | Resume/context mismatches |

## Main <-> Local-Runtime JSON-RPC Touchpoints

| Main owner | Local-runtime implementation owner | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| Local-runtime bridge | JSON-RPC protocol | `main/local_runtime_bridge.cjs`, `main/python/core/ipc_protocol.py` | Timed-out or unresolved RPC calls |
| SDK local-runtime callers | Method signatures | SDK local-runtime store/client code, `main/python/local_backend.py` methods | Param name mismatch and tool failure |
| Tool-arg normalizer | Tool argument canonicalization path | `main/local_runtime_tool_args.cjs`, `main/python/tools/registry.py` | Missing screenshot display-bounds defaults |
| Readiness lifecycle | Service startup | `main/local_runtime_bridge.cjs`, `main/python/local_backend.py` initialize/run | Process starts but marked unavailable |
| Memory RPC handlers | Local memory store | `main/local_runtime_bridge.cjs`, `main/python/local_backend_memory_handlers.py`, `main/python/memory/local_store.py` | Search/store no-op or parse errors |

## Tool Runtime Touchpoints

| Desktop client owner | Local-runtime implementation owner | Contract files | Contract note |
| --- | --- | --- | --- |
| SDK conversation/tool runtime | Tool registry | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `main/python/tools/registry.py`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` | Tool names and correlation ids must match exactly |
| Tool payload shaping | Tool result envelope | `ToolExecutionPayloads.ts`, `main/python/tools/result.py` | `success/error/output` key stability |
| Tool arg models | Tool schema models | SDK/main payload builders, `main/python/tools/schemas.py` | Arg validation fails in local-runtime Python |
| Browser tool payloads | Browser Use engine runtime | SDK tool router + `tools/browser/{browser_tool,browser_use_engine}.py` | Browser action unavailable or malformed |

## Memory + Transcript Touchpoints

| Desktop client owner | Local-runtime/backend owner | Contract files | Contract note |
| --- | --- | --- | --- |
| SDK transcript projection store | Local-runtime transcript store methods | `renderer/app/runtime/desktopConversationContinuityService.ts`, `renderer/app/runtime/desktopConversationLibraryClient.js`, `renderer/infrastructure/transcript/desktopConversationStore.ts`, `main/python/local_backend.py` transcript handlers | Missing or duplicate projected transcript rows |
| Memory search/store invokes | Local store + remote clients | Renderer dashboard/memory hooks, `memory/local_store.py`, remote clients | Search quality/latency regressions |
| Semantic summarizer cadence | Semantic endpoint | `memory/summarizer.py` + backend `/api/semantic/summarize` | Semantic memory not compacted |

## Voice + Audio Touchpoints

| Desktop client owner | Pair owner | Contract files | Contract note |
| --- | --- | --- | --- |
| Voice mode hook | Gateway protocol | `renderer/features/voice/hooks/useVoiceMode.ts` | Gateway frame/metadata mismatch |
| Wakeword capture hook | Wakeword bridge/service | `useWakewordDetection.ts`, `main/wakeword_bridge.cjs`, `main/wakeword_bridge_runtime.cjs`, `main/python/wakeword_service.py` | False retriggers or silent failures |
| Player service | Backend TTS stream events | `renderer/infrastructure/audio/PlayerService.ts`, backend `audio-chunk` events | Playback queue errors or decode failure |

## Contract Guardrails

1. Keep IPC channel constants single-sourced in `frontend/src/renderer/infrastructure/ipc/channels.ts`.
2. Keep renderer backend event guards in sync with backend outgoing schema changes.
3. Keep tool args parity between backend tool schemas and local-runtime executable schemas through explicit parity tests before production; do not make client/local-runtime Python code import backend modules to avoid drift.
4. Update docs in both `docs/frontend/inventory` and `docs/backend/inventory` on contract changes.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
- Backend Cross-Layer Contract Touchpoints Reference (private backend docs)
- [Frontend Contracts Docs Hub](../contracts/README.md)
