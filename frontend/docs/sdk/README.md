---
summary: "SDK hub for hosted backend clients, SDK routes, query planning, tracing, artifacts, OCR, vision, and tool authoring."
read_when:
  - When integrating with WindieOS programmatically.
  - When changing SDK clients, SDK routes, or hosted developer-facing APIs.
title: "SDK Hub"
---

# SDK Hub

Agent SDK docs cover the canonical client runtime for hosted backend access,
SDK local-runtime execution, and client-side conversation state. Electron, future
CLIs, custom UIs, and SDK users should share this runtime instead of owning
separate backend websocket loops, replay logic, or tool-result routing.

## SDK Pages

- [Hosted Backend Clients](hosted_backend_clients.md)
- [AgentClient Runtime Contract](windie_client_runtime.md)
- [SDK Conversation Runtime](conversation_runtime.md)
- [Agent Definition Contract](agent_definition.md)
- [SDK Route Change Workflow](sdk_route_change_workflow.md)
- [SDK Auth and Error Handling](sdk_auth_and_error_handling.md)
- [Query Planning and Trace](query_planning_and_trace.md)
- [OCR and Vision SDK](ocr_and_vision.md)
- [Tool Authoring](tool_authoring.md)

## Client Implementations

- TypeScript package: `packages/windie-sdk-js` publishes as `@windie/sdk`.
- Electron renderer SDK contracts facade: `frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts.ts`
- Python package: `packages/windie-sdk-python` publishes as `windie-sdk` and imports as `windie`.
- Python package entrypoint: `frontend/src/main/python/windie/__init__.py`
- Python SDK implementation: `frontend/src/main/python/windie/sdk.py`

Build the TypeScript SDK as a standalone package:

```bash
cd packages/windie-sdk-js
npm install
npm run build
```

The package build removes the previous `dist` and `cjs` outputs before
compiling so deleted SDK source files cannot survive in publishable artifacts.

Repo examples import the local SDK build through
`examples/_shared/local_sdk_loader.mjs`. That loader resolves `ws` and `tsc`
from `packages/windie-sdk-js/node_modules`, so runnable examples validate the
standalone SDK package instead of depending on Electron's `frontend/node_modules`.

## Examples

- `examples/cli-agent`: minimal Node CLI using `AgentClient`,
  `InMemoryConversationStore`, and `conversation.stream()` without Electron:
  `node examples/cli-agent/run.mjs`
- `examples/simple-chat-cli`: interactive CLI chat against the remote backend
  using `agent.chat(...)`:
  `AGENT_BACKEND_URL=https://backend.example.com node examples/simple-chat-cli/run.mjs`
- `examples/custom-ui`: minimal browser UI that renders SDK display projections
  against a mock backend:
  `node examples/custom-ui/run.mjs`
- `examples/local-tool-extension`: minimal local-runtime module-tool SDK example using
  `moduleTool(...)` and a Python `module:function` entrypoint:
  `node examples/local-tool-extension/run.mjs`
- `examples/repo-agent-extension`: runnable local-runtime plugin SDK example with
  one Python plugin tool and one command:
  `node examples/repo-agent-extension/run.mjs`

## API Owners

- SDK routes: `backend/src/api/routes/sdk/*`
- Artifact routes: `backend/src/api/routes/artifacts/*`
- Websocket: `backend/src/api/routes/websocket/*`
- Agent definition schema: `backend/src/api/schemas/agent_definition.py`

## Rule

Use `AgentClient.wakeUp(...)` for agent sessions, including desktop-style
hosts. The returned `Agent` creates SDK conversation runtimes that send
user intent, execute model-requested local tools, return tool results, emit
display/current-turn projections, and expose control commands for connection
checks, settings sync, model-list requests, rehydrate, manual compaction,
wakeword notification, stop, and local runtime status. The SDK runtime owns the
hosted backend websocket, managed reconnect/endpoint-fallback/idle lifecycle,
conversation runtime state, normalized projections, and local tool result
return. It delegates local execution through the SDK local runtime, backed by
the configured local runtime daemon. Host-specific
desktop policy, such as Electron window click-through or screenshot protection,
belongs in a `localToolLifecycle` callback supplied to `wakeUp(...)`. The
backend remains the owner of model lists, provider policy, OCR/vision
availability, prompt construction, compaction decisions, and paid capability
gates. TypeScript callers use `AgentClient` and `Agent` for reusable SDK host
code; the old Windie-prefixed client and agent wrapper modules have been
removed.

Python callers should use `AgentSdkClient.wake_up(...)` followed by
`agent.run(...)` or `agent.stream(...)` for the same high-level query shape. The
Python package is still transport-oriented, but it should not force common
callers down to raw websocket `query(...)` plus manual receive loops. The old
Python `WindieSdkClient` and `WindieSdkAgentSession` compatibility aliases have
been removed; use `AgentSdkClient` and `AgentSdkAgentSession` directly.

## Evidence Notes

- SDK behavior should be proven at the public runtime API and projection
  boundary before patching Electron-specific consumers.
- When custom UIs drift from desktop behavior, compare SDK display/current-turn
  projections rather than duplicating renderer heuristics.
