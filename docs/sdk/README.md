---
summary: "SDK hub for WindieOS hosted backend clients, SDK routes, query planning, tracing, artifacts, OCR, vision, and tool authoring."
read_when:
  - When integrating with WindieOS programmatically.
  - When changing SDK clients, SDK routes, or hosted developer-facing APIs.
title: "SDK Hub"
---

# SDK Hub

WindieOS SDK docs cover the canonical client runtime for hosted backend access,
local sidecar execution, and client-side conversation state. Electron, future
CLIs, custom UIs, and SDK users should share this runtime instead of owning
separate backend websocket loops, replay logic, or tool-result routing.

## SDK Pages

- [Hosted Backend Clients](hosted_backend_clients.md)
- [WindieClient Runtime Contract](windie_client_runtime.md)
- [SDK Conversation Runtime](conversation_runtime.md)
- [Agent Definition Contract](agent_definition.md)
- [SDK Route Change Workflow](sdk_route_change_workflow.md)
- [SDK Auth and Error Handling](sdk_auth_and_error_handling.md)
- [Query Planning and Trace](query_planning_and_trace.md)
- [OCR and Vision SDK](ocr_and_vision.md)
- [Tool Authoring](tool_authoring.md)

## Client Implementations

- TypeScript package: `packages/windie-sdk-js` publishes as `@windie/sdk`.
- TypeScript app re-export: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`
- Python package: `packages/windie-sdk-python` publishes as `windie-sdk` and imports as `windie`.
- Python sidecar package re-export: `frontend/src/main/python/core/windie_sdk_client.py`
- Renderer API barrel: `frontend/src/renderer/infrastructure/api/index.ts`
- Sidecar package export: `frontend/src/main/python/core/__init__.py`

Build the TypeScript SDK as a standalone package:

```bash
cd packages/windie-sdk-js
npm install
npm run build
```

Repo examples import the local SDK build through
`examples/_shared/local_sdk_loader.mjs`. That loader resolves `ws` and `tsc`
from `packages/windie-sdk-js/node_modules`, so runnable examples validate the
standalone SDK package instead of depending on Electron's `frontend/node_modules`.

## Examples

- `examples/cli-agent`: minimal Node CLI using `WindieClient`,
  `InMemoryConversationStore`, and `conversation.stream()` without Electron:
  `node examples/cli-agent/run.mjs`
- `examples/simple-chat-cli`: interactive CLI chat against the remote backend
  using `agent.chat(...)`:
  `WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs`
- `examples/custom-ui`: minimal browser UI that renders SDK display projections
  against a mock backend:
  `node examples/custom-ui/run.mjs`
- `examples/local-tool-extension`: minimal sidecar module-tool SDK example using
  `moduleTool(...)` and a Python `module:function` entrypoint:
  `node examples/local-tool-extension/run.mjs`
- `examples/repo-agent-extension`: runnable sidecar plugin SDK example with
  one Python plugin tool and one command:
  `node examples/repo-agent-extension/run.mjs`

## API Owners

- SDK routes: `backend/src/api/routes/sdk/*`
- Artifact routes: `backend/src/api/routes/artifacts/*`
- Websocket: `backend/src/api/routes/websocket/*`
- Agent definition schema: `backend/src/api/schemas/agent_definition.py`

## Rule

Use `WindieClient.wakeUp(...)` for agent sessions. Use
`WindieAgent.startDesktop(...)` when building a desktop-style agent host that
wants one SDK object to start/reuse local runtime tools, send user intent,
execute model-requested local tools, return tool results, and emit display rows.
The same object also exposes desktop control methods for connection checks,
settings sync, model-list requests, conversation rehydrate, manual compaction,
wakeword notification, stop, and local runtime status. The SDK runtime owns the
hosted backend websocket, managed reconnect/fallback/idle lifecycle,
conversation runtime state, normalized projections, and local tool result
return. It delegates local execution to the sidecar daemon. The backend remains
the owner of model lists, provider policy, OCR/vision availability, prompt
construction, compaction decisions, and paid capability gates.

Python callers should use `WindieSdkClient.wake_up(...)` followed by
`agent.run(...)` or `agent.stream(...)` for the same high-level query shape. The
Python package is still transport-oriented, but it should not force common
callers down to raw websocket `query(...)` plus manual receive loops.
