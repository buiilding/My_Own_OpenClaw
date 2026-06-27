---
summary: "Reference material extracted from AGENTS.md: project structure, dependency chains, backend agent runtime, SDK/desktop app architecture, runtime flows, and source-map entry points."
read_when:
  - When AGENTS.md tells you to inspect the detailed architecture/source-map reference.
  - When you need the longer project structure, runtime flow, backend agent runtime, SDK architecture, desktop app architecture, or key entry-point notes that used to live in AGENTS.md.
title: "Agent Architecture Reference"
---

# Agent Architecture Reference

This page preserves the detailed project and architecture notes that previously
lived in `AGENTS.md`. Keep `AGENTS.md` focused on rules, coding behavior, and
runtime ownership boundaries; keep longer source maps here or in the owning
subsystem docs.

## Project Structure

File counts and generated artifacts change often. Treat the filesystem as
canonical; the map below names the source roots and load-bearing files agents
usually need to edit.

```text
WindieOS/
├── backend/                       # Python FastAPI backend and agent runtime
│   └── src/
│       ├── main.py                # backend app entrypoint
│       ├── api/                   # FastAPI app assembly, routes, websocket handlers
│       ├── agent/                 # AgentSession, AgentExecutor, InteractionLoop, history
│       ├── llm/                   # prompt construction, provider adapters, model routing
│       ├── tools/                 # model-visible schema registry, policy, projection
│       ├── sdk/                   # backend SDK route/tool context helpers
│       └── core/                  # config, validation, logging, events, interfaces
├── frontend/                      # Electron desktop app, React renderer, local-runtime Python implementation
│   └── src/
│       ├── main/                  # Electron main, IPC, direct Electron agent-host wiring, local-runtime bridge
│       ├── main/python/           # local-runtime Python implementation: tools, memory, browser, system
│       ├── preload.js             # context-isolated IPC allowlist bridge
│       ├── renderer/              # React app, chat, dashboard, settings, voice surfaces
│       └── shared/                # shared IPC constants/contracts
├── packages/
│   ├── windie-sdk-js/             # TypeScript SDK runtime used by Electron and clients
│   └── windie-sdk-python/         # Python SDK client package
├── tests/
│   ├── backend/                   # backend route, agent, provider, tool, service tests
│   ├── sidecar/                   # local-runtime Python and local tool tests
│   ├── frontend/                  # Electron/main/renderer contract tests
│   └── sdk/                       # SDK runtime, transport, projection, store tests
├── docs/                          # agent-facing docs, runtime maps, workflows, references
├── scripts/                       # test wrappers, environment launchers, commit helper
├── bin/                           # repo-root command wrappers such as windie
├── plugins/                       # WindieOS extension/plugin examples and contracts
├── skills/                        # WindieOS skill prompt layers
├── mcps/                          # MCP server docs/config examples
└── examples/                      # SDK/client/tool integration examples
```

## File Dependency Chain

Keep these chains in mind before moving code. They are ownership chains, not
permission to import across runtime boundaries.

```text
Renderer feature code
  -> renderer app runtime facades
  -> preload allowlisted IPC
  -> Electron main IPC/runtime modules
  -> AgentClient.wakeUp(...) + agent.conversation(...) SDK runtime
  -> hosted/custom hosted backend HTTP/WebSocket
  -> backend agent loop and provider/tool policy
```

```text
Backend tool catalog/policy
  -> model-visible provider projection
  -> backend tool-call events
  -> SDK tool coordination
  -> SDK local runtime client
  -> local-runtime executable manifest/registry backed by local-runtime Python code
  -> local tool result
  -> SDK tool-result return
  -> backend history
```

```text
Local-runtime Python tool implementation files
  -> frontend/src/main/python/tools/registry.py
  -> frontend/src/main/python/tools/manifest.py
  -> SDK/local runtime executable tool manifest
  -> backend manifest validation and policy projection
```

Frontend and the local-runtime Python implementation must not import backend
code for parity. Backend should use schemas, manifests, transport contracts,
and tests to understand client/local-runtime capability.

## Backend Agent Runtime

WindieOS does not have a single Hermes-style `AIAgent` class. The equivalent
backend agent surface is deliberately split:

- `private backend implementation::AgentSession` owns per-user/session
  identity, conversation history, runtime state, compaction engine, current
  screenshot/system state, LLM client config, and the executor instance.
- `private backend implementation::AgentExecutor` owns the per-query
  pipeline setup: prompt formatting, user-history append, screenshot/OCR setup,
  tool preparation/sending/result processing components, completion side
  effects, and delegation into the interaction loop.
- `private backend implementation::InteractionLoop` owns the
  model/tool iteration loop: build prompt/tool schemas, call the provider,
  parse stream/tool calls, branch between final answer and tool execution, emit
  streaming events, and stop on completion or hard limits.

Usual backend call path:

```text
websocket query
  -> QueryMessageHandler
  -> QueryExecutionService.execute(...)
  -> SessionManager get/create AgentSession
  -> AgentSession.process_query(...)
  -> AgentExecutor.process_query(...)
  -> InteractionLoop.run_loop(...)
  -> LLM provider stream
  -> final response or tool calls
```

Agent classes are backend-owned. Do not mirror their state machines in Electron,
renderer, SDK clients, or the local runtime. Those runtimes may transport
events, render projections, execute local tools, or return tool results, but
backend keeps prompt policy, provider routing, history compaction, and
model-facing loop control.

### Agent Loop Shape

The real loop is async and event-streaming, not a synchronous `chat()` helper.
Conceptually:

```text
for each user query:
  build final user content and append it to backend history
  maybe compact before sampling
  while iteration budget remains:
    build current prompt and model-visible tool schemas
    stream provider response
    if provider yields final assistant text:
      emit completion and stop
    if provider yields tool calls:
      prepare executable arguments and emit tool-call events
      wait for local SDK/main results or run backend-owned tools
      commit tool outputs to backend history
      continue the loop
  emit deterministic limit/error completion on hard stop
```

Tool results must flow back through the backend history path. Renderer transcript
rows are display/storage projections, not replacements for backend inference
history during a live turn.

## Source Map Entry Points

Key entry points:

- Backend: private backend implementation,
  private backend implementation,
  private backend implementation,
  private backend implementation.
- SDK: `packages/windie-sdk-js/src/index.ts`,
  `packages/windie-sdk-js/src/runtime/AgentClient.ts`,
  `packages/windie-sdk-js/src/runtime/Agent.ts`,
  `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`,
  `packages/windie-sdk-js/src/transport/ManagedWebSocketSession.ts`,
  `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`.
- Electron main: `frontend/src/main/index.cjs`, `frontend/src/main/ipc.cjs`,
  `frontend/src/main/ipc/ipc_query_runtime.cjs`,
  `frontend/src/main/ipc/ipc_query_runtime.cjs`,
  `frontend/src/main/sidecar/local_runtime_bridge.cjs`,
  `frontend/src/main/surfaces/surface_runtime.cjs`.
- Renderer: `frontend/src/renderer/app/`,
  `frontend/src/renderer/features/chat/`,
  `frontend/src/renderer/features/dashboard/`,
  `packages/windie-sdk-js`,
  `frontend/src/renderer/app/runtime/`.
- Local-runtime Python implementation: `frontend/src/main/python/local_backend.py`,
  `frontend/src/main/python/sidecar_daemon.py`,
  `frontend/src/main/python/tools/manifest.py`,
  `frontend/src/main/python/tools/registry.py`.

For deeper source maps, start with `docs/getting-started/docs_hub.md`,
`docs/reference/code_change_surface_index.md`,
`docs/architecture/runtime_boundary_matrix.md`, and the subsystem docs listed by
`<windie> docs list`.

## SDK Architecture

The Agent SDK runtime is the reusable agent/client boundary. Electron is the
first first-party SDK host, not a separate agent implementation.

Key TypeScript SDK surfaces:

- `packages/windie-sdk-js/src/runtime/AgentClient.ts`: public wake-up
  orchestration, backend websocket/session creation, local runtime setup, and
  tool/plugin/MCP manifest assembly.
- `packages/windie-sdk-js/src/runtime/Agent.ts`: high-level agent helpers
  such as `ask`, `run`, `stream`, model updates, conversation management,
  memory/title commands, system prompt/tool schema commands, and artifact
  helpers.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`: reusable
  conversation command/runtime surface over SDK stores and backend transport.
  Electron main uses `AgentClient.wakeUp(...)`, then
  `agent.conversation(...)`, and forwards SDK `displayRows` / `currentTurn`
  snapshots to renderer surfaces.
- `packages/windie-sdk-js/src/runtime/AgentChatSession.ts`: chat-style session
  helper for an existing conversation.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`: reusable
  conversation command/runtime surface over a store and backend transport.
- `packages/windie-sdk-js/src/transport/ManagedWebSocketSession.ts`: hosted
  backend websocket lifecycle, typed query/stop/rehydrate/settings/model sends,
  backend event fan-out, and tool-result return.
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`: client/local-runtime
  tool claim, execution callback, result correlation, and backend result return.
- `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`: local runtime
  daemon discovery/start/reuse, local-runtime-backed storage, builtin tool selection,
  local memory/title RPCs, and module-tool registration helpers.

SDK ownership rules:

- Put reusable chat/session/tool/result/projection behavior in the SDK when it
  should work for Electron, CLI, custom UI, plugins, or tests.
- Treat the Electron UI as the reference SDK host: it should demonstrate how to
  build a desktop UI on top of the SDK, not as a privileged separate agent
  runtime. The same SDK primitives must be usable for custom GUI, TUI, CLI,
  plugin, and hosted-client experiences; interaction style is a client choice.
- Keep Electron-specific window, IPC, screenshot, permissions, and app lifecycle
  code in Electron main or renderer facades behind SDK interfaces.
- Keep local execution and local storage mechanics behind the local-runtime
  boundary; the SDK coordinates and normalizes the current local-runtime Python
  implementation.
- Keep backend model/provider/prompt/tool-policy decisions in the backend; the
  SDK reports local capability but does not grant backend capability.
- For SDK-authored agents, the client defines the active tool surface from
  requested built-ins, custom tools, plugins, MCPs, and skills. The backend may
  provide a default built-in schema set, but client-provided schemas can replace
  it entirely; backend responsibility is validation, policy filtering, provider
  projection, backend-native tool exposure, and prompt compilation.

## Desktop App Architecture

The WindieOS desktop app has four live runtime surfaces:

- React renderer owns UX state and display: chat, dashboard, settings, voice,
  active transcript projection, and display-only tool rows.
- Preload owns the narrow allowlisted IPC bridge exposed to the renderer.
- Electron main owns agent host policy plus OS/window/permission adapters:
  windows, overlays, menus, lifecycle, IPC handlers, endpoint diagnostics,
  permission prompts, direct Agent SDK startup, local-runtime supervision,
  wakeword supervision, screenshots, and platform policy.
- Local runtime owns local authority, backed by the current local-runtime Python
  implementation: filesystem, shell/process, computer use, browser mechanics,
  local memory, system state, and wakeword subprocess code.

Frontend query flow:

```text
MessageInput / chat hook
  -> renderer app-runtime facade
  -> SDK ConversationRuntime command
  -> SDK-shaped windie:invoke command
  -> Electron main query payload builder
  -> AgentClient.wakeUp(...) + agent.conversation(...) managed hosted session
  -> backend agent loop
```

Frontend stream flow:

```text
backend websocket event
  -> Agent SDK runtime normalization/projection
  -> Electron main forwards windie:rows + windie:conversation-event + windie:current-turn
  -> renderer projection listener updates live rows
  -> renderer stream side effects persist transcript metadata/events
```

Frontend tool flow:

```text
backend model-visible tool call
  -> SDK tool coordinator
  -> local-runtime executable tool
  -> SDK tool result return
  -> backend history
```

Do not rebuild the chat transcript, websocket loop, SDK tool coordination, model sync,
rehydrate, compaction, or replay semantics directly in renderer feature code.
Add or adjust renderer facades when UI needs a boundary, and move reusable
runtime behavior into the SDK instead of adding another Electron-only bridge.
The minimal chat pill must project the same current-turn progress as the main
dashboard, and the response overlay must project the same assistant response
portion as the dashboard instead of maintaining a divergent response model.

## Runtime Flow Cheatsheet

- Query send: renderer chat sender -> renderer live-turn app-runtime client ->
  `windie:invoke` command `conversation.send` -> Electron main query payload
  builder -> Agent SDK runtime -> backend websocket.
- Backend loop: websocket `query` -> query handler/service -> agent session ->
  executor -> interaction loop -> provider call -> final answer or tool calls.
- Stream receive: backend websocket event -> Agent SDK runtime projection ->
  `windie:rows`, `windie:conversation-event`, `windie:current-turn`, and
  `windie:status` -> renderer projection and transcript side effects.
- Tool turn: backend model-visible tool call -> Agent SDK tool router ->
  local-runtime executable tool -> SDK result return -> backend history.
- Conversation history: renderer-visible transcript and local-runtime-backed SDK store
  are durable local authority; backend sessions are inference state that can be
  rebuilt from local transcript.
