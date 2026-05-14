---
summary: "Tool contract map covering backend model-facing schemas, frontend tool execution, sidecar local tools, bundles, request ids, and validation."
read_when:
  - When changing tool schemas or tool result payloads.
  - When debugging backend/frontend/sidecar tool drift.
title: "Tool Contracts"
---

# Tool Contracts

WindieOS uses three tool contracts:

- **Backend-owned remote schema**: backend tools such as `web_search`.
- **Client-owned local model schema**: what the LLM can call for sidecar tools.
- **Sidecar executable schema**: what the local Python runtime actually executes.

They are related but intentionally not the same code. The public client sends a
`client_tool_manifest`; the hosted backend validates that manifest, applies
policy/provider projection, and can resolve high-level or grounded intent into a
simpler executable sidecar action.

Extension manifests use `schema` as the developer-facing JSON Schema field.
Electron maps that to the backend-facing `model_schema` field inside
`client_tool_manifest`. The Python sidecar generates extension
`execution_schema` from the entrypoint signature when possible and falls back to
`schema` for raw-dict entrypoints.

## Contract Flow

1. Client sends `client_tool_manifest` during websocket handshake.
2. Backend validates accepted/rejected manifest entries.
3. Backend builds backend remote tool schemas from `backend/src/tools/tool_catalog.py` and remote tool classes.
4. Prompt construction merges accepted client-local schemas with backend remote schemas.
5. Tool policy and provider/capability health narrow the exposed schema for the current session.
6. Backend emits transparency for accepted/rejected manifest entries, final tool schemas, and active `client_prompt_layers`.
7. The model emits a tool call.
8. Backend parser and preparation code validates, normalizes, and enriches the call.
9. Backend sends the executable payload over websocket as `tool-call` or `tool-bundle`.
10. Renderer `useToolRunner` dispatches through `ToolExecutionService`.
11. Main/sidecar execute local work through JSON-RPC.
12. Renderer returns `tool-result` or `tool-bundle-result`.
13. Backend transforms the result into model-facing history and continues the loop.

## Files to Inspect

| Concern | Files |
| --- | --- |
| Client manifest validation | `backend/src/tools/client_manifest.py` |
| Backend tool catalog | `backend/src/tools/tool_catalog.py` |
| Backend schemas and remote tools | `backend/src/tools/remote_tools/*`, `backend/src/tools/*schema*` |
| Tool policy and capability filters | `backend/src/tools/tool_policy.py`, `backend/src/tools/provider_health.py` |
| Preparation and coordinate resolution | `backend/src/agent/tools/preparation/*` |
| Sending/waiting/processing | `backend/src/agent/tools/sending/*`, `backend/src/agent/tools/waiting/*`, `backend/src/agent/tools/processing/*` |
| Renderer execution | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`, `frontend/src/renderer/infrastructure/services/toolExecution/*` |
| Main sidecar bridge | `frontend/src/main/local_backend_bridge*.cjs` |
| Sidecar registry | `frontend/src/main/python/tools/registry.py` |

For a step-by-step change route across these owners, use [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md).

## Validation Checklist

- Backend schema and parser tests cover the model-facing shape.
- Renderer tool-runner tests cover correlation and result envelopes.
- Sidecar registry/tool tests cover executable behavior.
- Cross-layer parity tests cover expected backend-exposed sidecar tool names.
- Bundle paths cover atomic success, partial failure, timeout, and cleanup.
