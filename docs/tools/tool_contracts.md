---
summary: "Tool contract map covering backend model-facing schemas, frontend tool execution, sidecar local tools, bundles, request ids, and validation."
read_when:
  - When changing tool schemas or tool result payloads.
  - When debugging backend/frontend/sidecar tool drift.
title: "Tool Contracts"
---

# Tool Contracts

WindieOS uses two tool contracts:

- **Model-facing backend schema**: what the LLM can call.
- **Sidecar executable schema**: what the local Python runtime actually executes.

They are related but intentionally not the same code. The backend can resolve high-level or grounded intent into a simpler executable sidecar action.

## Contract Flow

1. Backend builds tool schemas from `backend/src/tools/tool_catalog.py` and remote tool classes.
2. Tool policy and provider/capability health narrow the exposed schema for the current session.
3. The model emits a tool call.
4. Backend parser and preparation code validates, normalizes, and enriches the call.
5. Backend sends the executable payload over websocket as `tool-call` or `tool-bundle`.
6. Renderer `useToolRunner` dispatches through `ToolExecutionService`.
7. Main/sidecar execute local work through JSON-RPC.
8. Renderer returns `tool-result` or `tool-bundle-result`.
9. Backend transforms the result into model-facing history and continues the loop.

## Files to Inspect

| Concern | Files |
| --- | --- |
| Backend tool catalog | `backend/src/tools/tool_catalog.py` |
| Backend schemas and remote tools | `backend/src/tools/remote_tools/*`, `backend/src/tools/*schema*` |
| Tool policy and capability filters | `backend/src/tools/tool_policy.py`, `backend/src/tools/provider_health.py` |
| Preparation and coordinate resolution | `backend/src/agent/tools/preparation/*` |
| Sending/waiting/processing | `backend/src/agent/tools/sending/*`, `backend/src/agent/tools/waiting/*`, `backend/src/agent/tools/processing/*` |
| Renderer execution | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`, `frontend/src/renderer/infrastructure/services/toolExecution/*` |
| Main sidecar bridge | `frontend/src/main/local_backend_bridge*.cjs` |
| Sidecar registry | `frontend/src/main/python/tools/registry.py` |

## Validation Checklist

- Backend schema and parser tests cover the model-facing shape.
- Renderer tool-runner tests cover correlation and result envelopes.
- Sidecar registry/tool tests cover executable behavior.
- Cross-layer parity tests cover expected backend-exposed sidecar tool names.
- Bundle paths cover atomic success, partial failure, timeout, and cleanup.
