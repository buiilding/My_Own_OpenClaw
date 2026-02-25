---
summary: "Backend-focused cross-layer contract map covering API schemas, stream event formatters, tool-result envelopes, and sidecar/renderer boundary touchpoints."
read_when:
  - When changing backend message/tool schema contracts that affect frontend or sidecar behavior.
  - When debugging backend/frontend drift in stream events, tool payloads, or browser/schema compatibility.
title: "Backend Cross-Layer Contract Touchpoints Reference"
---

# Backend Cross-Layer Contract Touchpoints Reference

This reference lists backend-owned contracts that have direct frontend or sidecar impact.

## WebSocket Message Contract Touchpoints

| Backend contract owner | Contract files | Downstream consumers | Drift symptoms |
| --- | --- | --- | --- |
| Incoming message schemas | `backend/src/api/schemas/incoming.py` | Main process websocket sender (`frontend/src/main/ipc.cjs`) | Message rejected as invalid payload/type |
| Outgoing message schemas | `backend/src/api/schemas/outgoing.py` | Renderer stream consumers (`renderer/types/backendEvents.ts`, `useChatStream.ts`) | Event silently ignored or malformed UI state |
| Message type constants | `backend/src/api/contracts/message_types.py` | Main/renderer routing and typed guards | Handlers never invoked or wrong event branch |
| Handler route table | `backend/src/core/container/incoming_routing.py` | API handler registry wiring | Message types accepted by schema but not dispatched |

## Stream Event -> Formatter Touchpoints

| Backend event source | Formatter owner | Frontend consumer | Contract note |
| --- | --- | --- | --- |
| `ChunkEvent` / `ThinkingEvent` | `api/processing/formatters/{chunk,thinking}.py` | `useChatStream.ts` | `payload.text` vs `payload.status` must stay stable |
| `ToolCallEvent` / `ToolBundleEvent` | `api/processing/formatters/{tool_call,tool_bundle}.py` | `useToolRunner.ts`, tool-ghost UI | Correlation IDs + payload action fields required |
| `ToolOutputEvent` | `api/processing/formatters/tool_output.py` | `useChatStream.ts` + transcript/tool runtime | `success`, `output`, `metadata`, `request_id` semantics |
| `TokenCountEvent` | `api/processing/formatters/token_count.py` | Token count display + store | Numeric field naming/type stability |
| Prompt transparency events | `api/processing/formatters/{system_prompt,user_message,assistant_message,tool_schemas}.py` | Message transparency sections | Payload shape controls collapsible rendering |

## Tool Execution Contract Touchpoints

| Backend owner | Contract files | Frontend/sidecar owners | Contract note |
| --- | --- | --- | --- |
| Backend tool arg schemas | `backend/src/tools/{computer,filesystem,system,browser}/schemas.py` | Sidecar tool arg schemas (`frontend/src/main/python/tools/schemas.py`, browser schemas) | Must maintain field/literal parity for runtime execution |
| Unified tool schema registry | `backend/src/tools/registry.py`, `schema_registry.py` | Renderer tool runner + backend parser | Exposed schemas define model-call surface |
| Tool-result ingress schema | `incoming.py` (`ToolResultMessage`, `ToolBundleResultMessage`) | Renderer `ToolExecutionPayloads.ts` + main IPC relay | Single/bundle result field names must match |
| Pending result resolution | `agent/tools/waiting/storage/result_storage.py` | Renderer correlation IDs from tool runner | Request/bundle IDs must be stable across turn |

## Browser Contract Touchpoints

| Backend owner | Contract files | Sidecar owners | Contract note |
| --- | --- | --- | --- |
| Browser unified args | `backend/src/tools/browser/browser_control_args_schema.py` | `frontend/src/main/python/tools/browser/schemas.py` | Action names + optional fields must stay aligned |
| Compatibility fields | `backend/src/tools/browser/shared_compat_fields.py` | `openclaw_compat_schema.py` and adapter | Legacy aliases maintained for compatibility |
| Remote browser stub payload | `backend/src/tools/remote_tools/browser.py` | Sidecar `browser_tool.py`, `browser_adapter.py` | Payload transport keys must preserve action/args shape |

## Memory + Artifact Contract Touchpoints

| Backend owner | Contract files | Frontend/sidecar consumers | Contract note |
| --- | --- | --- | --- |
| `/api/embeddings` route | `api/routes/memory/embeddings.py` | Sidecar `remote_embedding_client.py` | Request/response schema stability for vector generation |
| `/api/semantic/summarize` route | `api/routes/memory/semantic.py` | Sidecar `remote_semantic_client.py`, summarizer | Summary/facts parser fallback behavior impacts store |
| Artifact route/store | `api/routes/artifacts.py`, `services/artifacts/store.py` | Main `ipc.cjs` artifact upload + renderer screenshot URL usage | Artifact id/url/data lookup consistency |

## TTS + Wakeword Contract Touchpoints

| Backend owner | Contract files | Frontend consumers | Contract note |
| --- | --- | --- | --- |
| Audio chunk streaming | `api/processing/tts/manager.py` + outgoing schemas | Renderer `PlayerService.ts` | `audio-chunk` payload fields and encoding type |
| Wakeword activated/greeting events | `api/handlers/wakeword.py`, `services/wakeword_execution.py` | Renderer wakeword controllers + chat surfaces | Greeting/activation event type continuity |

## Change Checklist (Cross-Layer Safe)

1. Update backend schema/formatter/tool code.
2. Update paired frontend/sidecar contracts and validators.
3. Update docs in both backend and frontend inventory/runtime hubs.
4. Run contract-focused tests (`tests/backend/*contract*`, frontend stream/tool tests, sidecar schema tests).

## Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Runtime Flow Matrix Reference](backend_runtime_flow_matrix_reference.md)
- [Frontend Inventory Docs Hub](../../frontend/inventory/README.md)
- [Frontend Contracts Docs Hub](../../frontend/contracts/README.md)
