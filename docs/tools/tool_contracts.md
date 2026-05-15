---
summary: "Tool contract map covering backend model-facing schemas, frontend tool execution, sidecar local tools, bundles, request ids, and validation."
read_when:
  - When changing tool schemas or tool result payloads.
  - When debugging backend/frontend/sidecar tool drift.
title: "Tool Contracts"
---

# Tool Contracts

WindieOS uses two tool-schema contracts:

- **Backend-owned remote schema**: backend tools such as `web_search`.
- **Client-owned local schema**: what the LLM can call for local sidecar tools.

The public client sends a `client_tool_manifest`; the hosted backend validates
that manifest, applies policy/provider projection, and can resolve high-level or
grounded intent into a simpler executable sidecar action.

Extension manifests use one developer-facing JSON Schema field: `schema`.
Extension authors pair that with `entrypoint`; the sidecar calls the entrypoint
with the arguments emitted for that tool.

## Contract Families

| Contract family | Model can see it? | Executed by | Producer | Backend responsibility | Drift check |
| --- | --- | --- | --- | --- | --- |
| backend remote tool | yes | backend service or remote route | backend tool catalog | schema, policy, parser, result/history conversion | No sidecar parity is needed, but provider projection and policy still apply. |
| client-local manifest tool | yes, after validation | sidecar or declared backend target for reserved tools | client `client_tool_manifest` | validation, accept/reject transparency, policy, provider projection | Accepted schema must match executable sidecar behavior or an explicit grounding mode. |
| provider-native declaration | yes, provider-specific | provider/runtime adapter | backend provider projection | provider dialect, parser compatibility, policy pruning | Projection may change dialect, not semantics. |
| sidecar-only helper | no until exposed | sidecar | Python sidecar registry | none unless promoted | Do not add prompt/schema visibility just because helper code exists. |
| renderer display projection | no | renderer UI | stream/transcript consumers | none unless backend emits event contract | Display rows must not become the source of model-facing truth. |

## Client Tool Manifest Shape

Backend validation accepts a partial manifest so one bad tool does not fail the whole websocket session. The public result is split into accepted and rejected entries and can be emitted to the client as manifest transparency.

Accepted tool entries normalize to:

| Field | Shape | Rule |
| --- | --- | --- |
| `name` | string matching `[a-zA-Z][a-zA-Z0-9_-]{0,95}` | unique within the manifest; reserved backend names are rejected unless explicitly overridable |
| `description` | non-empty string, capped length | becomes the model-facing function description when the schema does not already provide one |
| `execution_target` | `sidecar` or `backend` | arbitrary client manifests cannot add new backend tools |
| `schema` | supported JSON Schema subset or full function tool spec | converted into a canonical flat function schema for prompt construction |
| `argument_resolution` | `passthrough` or `backend_grounding` | tells reviewers whether backend preparation may transform model args before execution |

Rejected entries return `{name, reason}`. Treat rejection reasons as developer diagnostics, not model-facing prompt content.

Client-local schemas are merged with backend registry schemas before policy filtering. If a client schema has the same tool name as an accepted built-in override, the client schema wins for that name; otherwise duplicate names are rejected. After merging, `ToolPolicy` and provider projection still decide the final model-visible shape.

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
10. SDK runtime dispatches through Electron main to the sidecar daemon/local executor.
11. Main/sidecar execute local work through the daemon or JSON-RPC bridge.
12. SDK runtime returns `tool-result` or `tool-bundle-result`.
13. Backend transforms the result into model-facing history and continues the loop.

## Shape Separation Rules

- `client_tool_manifest` is model-facing input to backend validation; sidecar `entrypoint` is executable implementation.
- `schema` is the developer-authored extension schema field; `function_tool_schema` is the backend-normalized model-facing shape.
- `argument_resolution=passthrough` means model args should already be executable; `backend_grounding` means backend preparation may resolve higher-level intent first.
- `request_id`, `bundle_id`, `tool_call_id`, and renderer `correlation_id` join different stages. Do not collapse them unless the producer and consumer really share the same domain.
- Backend remote tools can be model-visible without sidecar entries. Sidecar helpers can exist without model visibility.
- Provider-native declarations can coexist with function schemas, but policy must still prevent disabled helper schemas from leaking back into the prompt.

## Files to Inspect

| Concern | Files |
| --- | --- |
| Client manifest validation | `backend/src/tools/client_manifest.py` |
| Client manifest handshake | `backend/src/api/routes/websocket/router.py`, `frontend/src/main/agent_capability_handshake.cjs` |
| Backend tool catalog | `backend/src/tools/tool_catalog.py` |
| Backend schemas and remote tools | `backend/src/tools/remote_tools/*`, `backend/src/tools/*schema*` |
| Tool policy and capability filters | `backend/src/tools/tool_policy.py`, `backend/src/tools/provider_health.py` |
| Prompt merge and projection | `backend/src/llm/prompts/prompt_constructor.py`, `backend/src/tools/provider_projection.py` |
| Preparation and coordinate resolution | `backend/src/agent/tools/preparation/*` |
| Sending/waiting/processing | `backend/src/agent/tools/sending/*`, `backend/src/agent/tools/waiting/*`, `backend/src/agent/tools/processing/*` |
| Renderer execution | `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`, `frontend/src/renderer/infrastructure/services/toolExecution/*` |
| Main sidecar bridge | `frontend/src/main/local_backend_bridge*.cjs` |
| Sidecar registry | `frontend/src/main/python/tools/registry.py` |

For a step-by-step change route across these owners, use [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md).

## Validation Checklist

- Backend schema and parser tests cover the model-facing shape.
- Client manifest tests cover accepted, rejected, duplicate, reserved, oversized, and grounding-mode entries.
- Renderer tool-runner tests cover correlation and result envelopes.
- Sidecar registry/tool tests cover executable behavior.
- Cross-layer parity tests cover expected backend-exposed sidecar tool names.
- Bundle paths cover atomic success, partial failure, timeout, and cleanup.
