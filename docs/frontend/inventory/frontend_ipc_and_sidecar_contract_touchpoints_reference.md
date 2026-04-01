---
summary: "Frontend-focused contract map across renderer IPC channels, main-process handlers, sidecar JSON-RPC methods, and backend stream/tool payload boundaries."
read_when:
  - When changing renderer/main/sidecar contracts for query, tool, memory, or voice flows.
  - When debugging IPC mismatch, missing event handling, or sidecar method payload drift.
title: "Frontend IPC and Sidecar Contract Touchpoints Reference"
---

# Frontend IPC and Sidecar Contract Touchpoints Reference

This reference maps frontend-owned contract boundaries and their paired modules.

## Renderer <-> Main IPC Touchpoints

| Renderer owner | Main owner | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| IPC bridge wrappers | IPC handlers | `renderer/infrastructure/ipc/{bridge,channels}.ts`, `main/ipc.cjs` | Invoke/send fails, unknown channel errors |
| Query send API | Backend relay path | `renderer/infrastructure/api/client.ts`, `main/ipc.cjs` | Query never sent or missing ACK gating |
| Overlay controls | Overlay handlers | Renderer overlay listeners + `main/overlay_*_handler.cjs` | Chatbox/response overlay misbehavior |
| Wakeword toggle/events | Wakeword bridge lifecycle | Voice hooks + `main/wakeword_bridge.cjs` + `main/wakeword_bridge_runtime.cjs` | No detection or duplicate wakeword triggers |

## Main <-> Backend WebSocket Touchpoints

| Main owner | Backend pair | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| Outgoing message relay | Incoming schemas/routes | `main/ipc.cjs`, backend `api/schemas/incoming.py` | Backend validation errors |
| Inbound event rebroadcast | Outgoing schemas/formatters | `main/ipc.cjs`, backend `api/schemas/outgoing.py` | Renderer drops events |
| Settings ACK gating | Settings handlers | `main/ipc.cjs`, backend `api/handlers/settings.py` | First-query sync race or stale config |
| Conversation/session refs | Query/rehydrate handlers | `main/ipc.cjs`, backend query/rehydrate services | Resume/context mismatches |

## Main <-> Sidecar JSON-RPC Touchpoints

| Main owner | Sidecar owner | Contract files | Drift symptoms |
| --- | --- | --- | --- |
| Local backend bridge | JSON-RPC protocol | `main/local_backend_bridge.cjs`, `main/python/core/ipc_protocol.py` | Timed-out or unresolved RPC calls |
| RPC mapped handlers | Method signatures | `main/local_backend_bridge_rpc_mappers.cjs`, `main/python/local_backend.py` methods | Param name mismatch and tool failure |
| Tool-arg normalizer | Tool argument compatibility path | `main/local_backend_bridge_tool_args.cjs`, `main/python/tools/registry.py` | Missing wrapper-field rewrites (`system_use -> run_shell_command` sudo mode) |
| Readiness lifecycle | Service startup | `main/local_backend_bridge.cjs`, `main/python/local_backend.py` initialize/run | Process starts but marked unavailable |
| Memory service protocol | Memory loop | Main memory invocations + `main/python/memory_service.py` | Search/store no-op or parse errors |

## Tool Runtime Touchpoints

| Frontend owner | Sidecar owner | Contract files | Contract note |
| --- | --- | --- | --- |
| Tool runner service | Tool registry | `renderer/infrastructure/services/ToolExecutionService.ts`, `main/python/tools/registry.py` | Tool names must match exactly |
| Tool payload shaping | Tool result envelope | `ToolExecutionPayloads.ts`, `main/python/tools/result.py` | `success/error/output` key stability |
| Tool arg models | Tool schema models | Renderer/main payload builders, `main/python/tools/schemas.py` | Arg validation fails on sidecar |
| Browser tool payloads | Browser adapter/runtime | Renderer tool runner + `tools/browser/{browser_tool,browser_adapter,browser_runtime}.py` | Browser action unavailable or malformed |

## Memory + Transcript Touchpoints

| Frontend owner | Sidecar/backend owner | Contract files | Contract note |
| --- | --- | --- | --- |
| Transcript writer queues | Sidecar transcript store methods | `renderer/infrastructure/transcript/TranscriptWriter.ts`, `main/python/local_backend.py` transcript handlers | Missing or duplicate transcript rows |
| Memory search/store invokes | Local store + remote clients | Renderer dashboard/memory hooks, `memory/local_store.py`, remote clients | Search quality/latency regressions |
| Semantic summarizer cadence | Semantic endpoint | `memory/summarizer.py` + backend `/api/semantic/summarize` | Semantic memory not compacted |

## Voice + Audio Touchpoints

| Frontend owner | Pair owner | Contract files | Contract note |
| --- | --- | --- | --- |
| Voice mode hook | Gateway protocol | `renderer/features/voice/hooks/useVoiceMode.ts` | Gateway frame/metadata mismatch |
| Wakeword capture hook | Wakeword bridge/service | `useWakewordDetection.ts`, `main/wakeword_bridge.cjs`, `main/wakeword_bridge_runtime.cjs`, `main/python/wakeword_service.py` | False retriggers or silent failures |
| Player service | Backend TTS stream events | `renderer/infrastructure/audio/PlayerService.ts`, backend `audio-chunk` events | Playback queue errors or decode failure |

## Contract Guardrails

1. Keep IPC channel constants single-sourced in `renderer/infrastructure/ipc/channels.ts`.
2. Keep renderer backend event guards in sync with backend outgoing schema changes.
3. Keep tool args parity between backend tool schemas and sidecar tool schemas through explicit parity tests before production; do not make frontend/sidecar code import backend modules to avoid drift.
4. Update docs in both `frontend/inventory` and `backend/inventory` on contract changes.

## Related Docs

- [Frontend Inventory Docs Hub](README.md)
- [Frontend Runtime Surface Matrix Reference](frontend_runtime_surface_matrix_reference.md)
- [Backend Cross-Layer Contract Touchpoints Reference](../../backend/inventory/backend_cross_layer_contract_touchpoints_reference.md)
- [Frontend Contracts Docs Hub](../contracts/README.md)
