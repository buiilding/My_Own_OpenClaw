---
summary: "Final WindieClient runtime contract for SDK callers, Electron main, hosted backend websocket ownership, local sidecar daemon registration, and tool-result routing."
read_when:
  - When changing `WindieClient.wakeUp`, backend websocket ownership, or local sidecar daemon integration.
  - When adding SDK, CLI, Electron, plugin, MCP, or module-tool entrypoints.
title: "WindieClient Runtime Contract"
---

# WindieClient Runtime Contract

## Runtime Boundary

`WindieClient` is the canonical agent client runtime.

```text
Electron main / future CLI / SDK users
        |
        v
TS Windie SDK runtime
        |---------------- hosted backend HTTP/WebSocket
        |
        |---------------- local sidecar daemon HTTP/WebSocket
                              |
                              |-- built-in tools
                              |-- module-path tools
                              |-- plugin tools
                              |-- MCP tools
```

Ownership rules:

- SDK runtime owns hosted backend HTTP/WebSocket connection, handshake, query,
  stop, settings, event fan-out, normalized conversation events, display and
  rehydrate projections, edit/retry revision semantics, and tool-result return.
- the SDK transport module owns websocket session framing, backend event fan-out,
  and the conversation transport adapter used by `ConversationRuntime`. That
  adapter exposes query, rehydrate, stop, tool-result, settings-update, and
  list-models websocket commands as one typed backend boundary.
- the SDK hosted HTTP transport owns model listing, prompt/query-plan
  introspection, artifact upload URLs, OCR routes, and vision routes exposed to
  public SDK callers.
- the SDK local-runtime module owns sidecar daemon HTTP calls, daemon discovery,
  auto-start/reuse, sidecar event subscriptions, sidecar-backed conversation
  storage, builtin desktop tool selection, memory/title RPC helpers, and
  `moduleTool(...)` registration helpers.
- the SDK `WindieClient` runtime module owns wake-up orchestration, websocket
  session creation, initial model selection, local-runtime startup/reuse, and
  conversion of local tool/plugin/MCP definitions into the client manifest.
- the SDK agent stream-event module owns the public event projection from
  normalized conversation events to high-level `agent.stream(...)` events,
  including duplicate tool-output suppression for local/backend acknowledgements.
- the SDK `WindieAgent` runtime module owns high-level agent helpers such as
  `ask`, `run`, `stream`, `chat`, model updates, conversation creation,
  conversation listing/search/loading/deletion over a store adapter, memory
  commands, title commands, system prompt/tool-schema commands, and artifact
  helpers.
- sidecar daemon owns local execution only.
- backend owns model/provider selection, paid capability gates, OCR/vision/prediction/web-search availability, prompt construction, session policy, and remote/backend tools.
- Electron owns windows, renderer IPC, overlays, permission prompts, display/screenshot integration, and settings UI.

Local runtime facts must not unlock backend capabilities. In particular, coordinate methods are backend policy/provider outputs. The client can report or narrow local executable tools; it cannot grant OCR, vision, prediction, or paid backend capabilities.

There are two SDK consumption levels. External clients use the high-level
`WindieClient.wakeUp(...)` surface because it hides agent definition,
websocket/session, local-runtime, and store details. The built-in Electron
desktop is a first-party SDK host: it may use lower-level SDK runtime modules
such as `ManagedBackendSession`, typed backend sends, `ToolExecutionCoordinator`,
and conversation-runtime factories through desktop runtime facades. Electron
must not reimplement SDK behavior separately, and Electron-only adapters such
as the sidecar-backed conversation store and desktop backend transport stay
behind SDK interfaces like `ConversationStore` and `BackendTransport`.

## Public API

```ts
import { WindieClient, moduleTool, windieBuiltins } from "@windie/sdk";

const client = new WindieClient();

const simpleAgent = await client.wakeUp({
  backendUrl: "https://api.windieos.com",
  systemPrompt: "You are a helpful assistant. Be concise. This text-only client has no callable tools.",
  // builtins defaults to "none", so no tool schemas are exposed.
});

const agent = await client.wakeUp({
  backendUrl: "https://api.windieos.com",
  systemPrompt: "You are a concise coding agent.",
  workspacePath: "/Users/me/project",
  builtins: ["filesystem", "shell"],
  model: {
    modelProvider: "openai",
    modelId: "gpt-5.4@@gpt-5-4-medium-thinking",
    modelMode: "online",
    interactionMode: "agent"
  },
  tools: [
    moduleTool({
      name: "save_note",
      description: "Save a local note.",
      module: "my_project.tools:save_note",
      schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false
      }
    })
  ],
  skills: [],
  mcps: [],
  plugins: []
});

await agent.ask("Read the repo instructions and summarize the tests.");

const conversation = agent.conversation({ conversationRef: "repo-checks" });
for await (const event of conversation.stream({ text: "Run the tests and summarize failures." })) {
  if (event.type === "conversation_event" && event.event.type === "assistant_delta") {
    process.stdout.write(String(event.event.payload.text ?? ""));
  }
}
await conversation.editAndResend({
  messageId: "previous-user-message-id",
  text: "Run the focused SDK tests and summarize failures."
});
await conversation.rehydrate();

await agent.setModel({
  modelProvider: "openai",
  modelId: "gpt-5.4@@gpt-5-4-high-thinking",
  modelMode: "online",
  interactionMode: "agent"
});

for await (const event of conversation.stream({
  text: "Run the test command with this model and report progress.",
  model: {
    modelProvider: "openai",
    modelId: "gpt-5.4@@gpt-5-4-high-thinking"
  }
})) {
  if (event.type === "conversation_event" && event.event.type === "assistant_delta") {
    process.stdout.write(String(event.event.payload.text ?? ""));
  }
}

for await (const event of agent.stream("Run the test command and report progress.")) {
  if (event.type === "text") {
    process.stdout.write(event.text);
  }
  if (event.type === "tool_call") {
    console.log(`using ${event.toolName}`);
  }
  if (event.type === "complete") {
    console.log(event.finalResponse);
  }
}

await agent.ask("Use the fast model for this one-shot query.", {
  model: {
    modelProvider: "openai",
    modelId: "gpt-5.4@@gpt-5-4-none-thinking",
    interactionMode: "chat"
  }
});

const recentConversations = await agent.listConversations({ limit: 20 });
const matchingConversations = await agent.searchConversations({
  query: "repo tests",
  limit: 10
});
await agent.loadConversation(recentConversations[0].conversationRef);
await agent.deleteConversation(matchingConversations[0].conversationRef);

const chat = agent.chat({ conversationRef: "repo-checks" });
for await (const event of chat.stream("Continue from the last result.")) {
  if (event.type === "text") {
    process.stdout.write(event.text);
  }
}
await chat.retry();
await chat.stop();

await agent.searchMemory({ query: "repo preferences", memoryType: "semantic" });
await agent.storeMemory({
  userQuery: "User prefers focused tests.",
  assistantResponse: "Use the smallest relevant test slice.",
  memoryType: "semantic"
});
await agent.generateConversationTitle({
  user_message: "How does the SDK work?",
  assistant_message: "The SDK owns the reusable runtime."
});
await agent.updateConversationTitle("repo-checks", "SDK runtime notes");
await agent.getSystemPrompt();
await agent.listToolSchemas();
await agent.updateSystemPrompt("You are a concise coding agent.");
await agent.updateToolSchemas([{ name: "read_file", schema: { type: "object" } }]);
const uploaded = await agent.uploadArtifact(file);
const artifactUrl = agent.artifactUrl(uploaded.artifact_id);
```

`wakeUp` performs this sequence:

1. Resolve the hosted backend URL.
2. Ensure a sidecar runtime client is available when local execution is needed.
3. Register module/plugin/MCP tools with the sidecar daemon.
4. Read the sidecar tool manifest.
5. Build the low-level backend `agent_definition`.
6. Connect to the backend websocket.
7. Send the websocket handshake with `agent_definition`.
8. Normalize backend events into SDK conversation events.
9. Route backend events to callers and route local `tool-call` events to the sidecar daemon.
10. Project display transcript and rehydrate snapshots from normalized events.

When a local runtime supports events, callers can subscribe through the SDK
runtime instead of connecting to the sidecar daemon directly:

```ts
const unsubscribe = agent.subscribeLocalRuntimeEvents((event) => {
  if (event.type === "conversation-title-updated") {
    // Refresh conversation metadata in the host UI.
  }
});
```

## Conversation Runtime

The SDK conversation runtime is the canonical client-side state layer for
desktop, CLI, custom UI, and tests.

```text
backend websocket event
  -> SDK event normalizer
  -> normalized conversation event
  -> ConversationStore adapter
  -> SDK projections
     -> display transcript
     -> backend rehydrate snapshot
     -> tool trace
     -> compaction state
```

Stores are persistence adapters. They append/load events and commit complete
compacted replay snapshots, but they do not own display or backend rehydrate
interpretation. Projection builders in the SDK own those views. The store
interface exposes `loadForDisplay(...)` and `loadForRehydrate(...)` as
first-class convenience methods, and adapters must implement them by delegating
to shared SDK projections or to a complete active compacted replay snapshot.
Conversation event order is append order. Store adapters must not re-sort event
logs by timestamp or event id; timestamps are metadata, not ordering authority.

SDK adapter contracts export named payload types for the core runtime boundary:
`AgentDefinition`, `QueryPayload`, `ToolResultPayload`,
`ToolBundleResultPayload`, `RehydratePayload`, `StopPayload`,
`LocalRuntimeStatus`, `LocalToolManifest`, and `ToolRegistration`. Adapter
implementations should use those types rather than accepting unstructured
records for query, rehydrate, stop, tool-result, and local-runtime operations.

Electron uses the SDK `SidecarConversationStore` through a desktop store factory:

- canonical SDK events are stored in the sidecar `chat_events` table as the
  storage truth for desktop display and backend rehydrate
- transcript/replay fallback is removed; conversations that participate in the
  SDK runtime must load from canonical `chat_events` rows
- compacted replay snapshots are persisted as `compaction_applied` conversation
  events with complete generation payloads, not as hidden replay rows
- desktop compaction replacement-history writes go through
  `SidecarConversationStore.replaceCompactedReplay(...)` instead of stream
  handlers directly mutating replay storage
- compacted replay replacement appends a new generation with entry count and
  completion metadata; loaders keep using the previous complete generation if a
  newer write is partial
- desktop backend-session rehydrate uses the SDK store projection
  instead of shaping messages directly from visible transcript rows
- desktop recent-chat and open-chat loading use store metadata/display
  projections over canonical event rows only
- desktop chat deletion goes through the SDK `SidecarConversationStore` and
  removes canonical `chat_events` rows
- startup metadata loading does not apply a hidden local chat limit; SDK callers
  pass explicit `listMetadata({ limit, cursor })` options when they want bounded
  pages. `cursor` is the last `conversationRef` from the previous page.
- Electron store event loading preserves the sidecar row append order from
  `message_index` pagination. It must not re-sort events by timestamp or event
  id because same-timestamp turns, tool pairs, and assistant commits depend on
  append order.
- desktop edit/resend and try-again visible transcript rewrites are routed
  through the desktop conversation store factory into the SDK
  `SidecarConversationStore`. The factory owns local transcript projection
  replacement, workspace metadata, rewritten row enrichment, and the rehydrate
  projection used before the resend turn.
- desktop visible transcript appends route through
  `DesktopTranscriptProjectionRuntimeClient` and the desktop conversation store
  factory, so queued user/assistant/tool writes no longer own direct row IPC or
  replay append mutation.
- desktop chat feature code uses the transcript-session runtime facade for
  active conversation/user identity, while user, assistant, and tool transcript
  writes go through focused chat-feature persistence helpers into the SDK-backed
  projection runtime instead of through the conversation command facade.
- desktop dashboard and app config session synchronization use an app-level
  transcript-session runtime facade, so feature/provider code does not import
  transcript infrastructure directly for conversation/user identity updates.
- desktop dashboard conversation list/load/delete/search commands use
  `DesktopConversationLibraryClient`, which delegates to
  `DesktopTranscriptProjectionRuntimeClient` before reaching the SDK store
  factory.
- desktop chat and dashboard local snapshot loading also go through
  `DesktopConversationRuntimeClient` or `DesktopConversationLibraryClient`, so
  feature code does not import transcript snapshot loaders directly.
- desktop manual compaction controls share one rehydrate-first runtime helper
  that uses the SDK store-backed conversation rehydrate path before sending
  `compact-history`.
- desktop and custom SDK hosts use the same backend settings route for
  model/provider updates. Public SDK callers should use `agent.setModel(...)`
  rather than shaping `update-settings` payloads by hand.
- `wakeUp({ model })` applies an initial backend settings update immediately
  after websocket handshake and before the returned agent can send a turn.
- high-level `agent.ask(...)`, `agent.run(...)`, and `agent.stream(...)` string
  helpers accept a `model` option and apply it before sending the turn; advanced
  callers can still use `conversation.setModel(...)` or per-turn conversation
  `model` options when they need revision-aware conversation control.
- conversation-scoped model changes append a normalized `settings_updated`
  event after the backend accepts the settings update. Runtime snapshots expose
  the latest merged settings for debugging and custom UI state, while display
  and rehydrate projections keep model changes out of visible chat rows and
  provider history.
- backend `assistant-message-full` events normalize to canonical
  `assistant_message` conversation events. `streaming-complete` normalizes to
  `turn_completed` lifecycle state only; it must not create visible transcript
  rows or provider rehydrate history.
- backend `tool-call` events must preserve provider-safe tool identity. The SDK
  normalizer resolves `toolCallId` from explicit payload fields or the
  model-facing tool call metadata, and the local tool coordinator carries
  `requestId`, `toolCallId`, and `correlationId` into stored `tool_output`
  events.
- rehydrate projection keeps tool history only when calls and outputs are paired,
  but pairing can use any shared wait/provider identity: `toolCallId`,
  `requestId`, `correlationId`, or `bundleId`.
- rehydrate messages must match the backend `rehydrate-conversation` ingress
  schema. Tool names use `tool_name`, provider calls use `tool_calls`, and
  bundle metadata stays in `structured_payload`; display-only keys such as
  `name`, top-level `bundle_id`, `tools`, or `results` are not emitted as
  backend replay fields.
- `ConversationRuntime.rehydrate()` sends a complete replace-mode backend
  payload, including `conversation_ref`, `messages`, and
  `rehydrate_mode: "replace"`, so transport adapters do not need to repair SDK
  command shape.
- bundled tool rehydrate expands complete step results into provider-safe
  `role: "tool"` entries keyed by each step's `tool_call_id` instead of
  replaying an internal bundle trace row.
- public agent stream projection uses the same identity set for tool-output
  dedupe and includes provider-safe `tool_call_id` on synthetic tool-call
  events.
- SDK tool correlation helpers own display/projection alias resolution for
  `requestId`, `toolCallId`, `correlationId`, and `bundleId` across camelCase
  SDK events and snake_case backend payloads. The runtime reducer also uses
  these helpers for pending tool waits, so provider-safe `toolCallId` can close
  a pending tool when request ids are unavailable. Electron store/projection
  adapters and renderer chat utilities may call these helpers through the SDK
  barrel, but they should not maintain separate backend-alias parsers.
- the Electron main-process SDK tool router accepts canonical SDK identity fields
  (`requestId`, `toolCallId`, `correlationId`, `bundleId`) before emitting
  backend wire payloads.
- the Python SDK websocket session also forwards request, provider, correlation,
  and bundle identities into local runtime `execute_tool(...)` calls so sidecar
  execution can preserve SDK-owned tool routing state.

Skipped compaction is represented as `compaction_skipped`. It is runtime/debug
state and should not render as assistant output or a full compacted-history panel
in normal UI.

## Low-Level Agent Definition

`agent_definition` remains the hosted backend wire contract, not the normal authoring surface.

The SDK builds:

```json
{
  "version": 1,
  "id": "windie-agent-...",
  "name": "Windie Agent",
  "system_prompt": {
    "mode": "replace",
    "content": "You are a concise coding agent."
  },
  "tools": {
    "mode": "client_only",
    "client_manifest": {
      "version": 1,
      "tools": []
    }
  },
  "skills": [],
  "mcps": [],
  "plugins": [],
  "runtime": {
    "workspace_path": "/Users/me/project",
    "operating_system": "macOS"
  }
}
```

`runtime.operating_system` is detected by the SDK runtime. It is not a public wake-up parameter.

## Local Runtime Options

Electron uses `sidecar_daemon_manager.cjs` to start or reuse the daemon and then
passes the daemon client into the SDK runtime. Node/CLI SDK hosts use the default
auto sidecar provider: when `wakeUp` sees module tools, plugins, or MCP servers,
it reads the daemon discovery file, reuses a healthy daemon when present, or
starts `sidecar_daemon.py` and waits for fresh discovery metadata.

Non-Electron SDK hosts can override that behavior with:

- `autoSidecar`: daemon script, discovery file, host/port, timeout, Python
  command, and optional `pythonArgs` launcher prefix for the default Node
  provider. Repo-local examples use this to run
  `scripts/python-in-env sidecar python` while leaving daemon discovery,
  registration, and shutdown with `WindieClient`.
- `ensureLocalRuntime`: an async provider that starts/reuses a daemon and returns
  a `WindieLocalRuntimeClient` when `wakeUp` needs local execution.
- `sidecar`: a custom `WindieLocalRuntimeClient` implementation.
- `localRuntime`: an alias for the same custom runtime interface.
- `sidecarDaemon`: daemon `baseUrl` and per-process `token`; `WindieClient`
  creates a `SidecarDaemonHttpClient` and uses `/status`, registration endpoints,
  `/tools`, and `/execute-tool`.

The default auto provider is Node-only. Browser-hosted SDK consumers should pass
`sidecar`, `localRuntime`, `sidecarDaemon`, or `ensureLocalRuntime` explicitly
when they need local execution.

After `wakeUp` resolves a local runtime, `WindieClient.status()`,
`WindieClient.listTools()`, and `WindieClient.shutdownLocalRuntime()` operate on
that known runtime. The returned `WindieAgent` exposes the same local-runtime
status/tool-list/shutdown helpers, so SDK hosts can keep using the agent object
after wake-up instead of retaining the root client. These helpers do not
auto-start a daemon just to inspect status.

The SDK does not accept raw JavaScript/Python closures as durable tools.
Module tools must be registered by import path, plugin tools by package path, and
MCP tools by server spec.

## Event And Tool Routing

Inbound backend event flow:

```text
backend websocket event -> SDK session -> Electron/UI/SDK listeners
```

For local tool calls:

```text
backend tool-call -> SDK conversation runtime -> sidecar /execute-tool -> backend tool-result
```

`WindieAgentSession` is now transport-only. It connects, handshakes, sends
queries/results, and emits raw backend events. It does not execute local tools.
`ManagedBackendSession` owns the reusable managed websocket lifecycle for hosts
that need connection waiters, reconnect scheduling, endpoint fallback, idle
disconnect, typed backend sends, and raw event parsing. Electron main consumes
that SDK package transport and only supplies host-specific socket construction,
headers, handshake data, local tool execution, and renderer fan-out.
`agent.stream(...)` and `agent.conversation(...).stream(...)` both run through
`SdkConversationRuntime`, which owns local tool execution when a sidecar/local
runtime adapter is available.
SDK backend event normalization requires explicit `conversation_ref`; turn-only
or session-only events remain raw debug events and are not appended to the
conversation store.

## Public Methods

Current canonical surface:

- `wakeUp`
- `ask`
- `query`
- `stop`
- `sleep`
- `updateSettings`
- `setModel`
- `run`
- `stream`
- `conversation`
- `shutdownLocalRuntime`
- `listModels`
- `listAgents`
- `listTools`
- `status`
- `subscribeRawBackendEvents`

`listModels` is backend-owned. `listAgents` is SDK-runtime state for active local agent sessions.

`agent.subscribeRawBackendEvents(listener)` is a debug surface. It receives
typed backend websocket events before conversation projection and returns an
unsubscribe function. Normal app authors should use `agent.stream(...)`,
`conversation.stream(...)`, or `conversation.subscribe(...)`; raw backend events
are for trace tools, tests, and protocol debugging only.

`agent.setModel({ modelProvider, modelId, modelMode?, interactionMode? })` is
the first-class SDK model-changing API for agent-level selection. Conversation
runtimes also expose `conversation.setModel(...)`, and `conversation.send`,
`conversation.stream`, `conversation.editAndResend`, and `conversation.retryTurn`
accept `model` to switch immediately before the next turn. These APIs validate
the public camelCase selection and send the backend-owned `update-settings`
message with `model_provider`/`selected_model_id`. Desktop model dropdowns still
persist through renderer config during migration, but their deferred query-time
backend patch is built through the same SDK model-selection contract instead of
hand-shaped renderer payloads. `updateSettings(config)` remains available for
host applications that own a broader settings surface.

Desktop model changes now route through renderer app runtime facades before
they reach the low-level IPC adapter. Chat features should call
`DesktopConversationRuntimeClient.setModel(...)`; that facade delegates to the
settings runtime, which builds the same SDK model-selection patch used by
public `WindieClient` callers. Feature code should not shape
`update-settings` payloads or call the backend API adapter directly.

`stream(input, options)` returns an `AsyncIterableIterator<WindieAgentStreamEvent>`.
It is a high-level projection over `SdkConversationRuntime.stream()`: it
stores normalized events, preserves `conversationRef`/`turnRef`, routes local
tool calls through the SDK coordinator, and maps runtime events into `start`,
`text`, `tool_call`, `tool_output`, `complete`, `error`, or generic `event`
items for callers that use the older agent-stream shape.

`conversation(options)` returns an SDK conversation runtime backed by the agent
session transport. It is the migration path for clients that need local event
storage, display projections, rehydrate snapshots, stop handling, streaming,
and edit/retry revision operations.

`createConversationRuntime(options)` is the host-adapter factory for clients
that already have a `ConversationStore` and `BackendTransport`. Electron uses
this lower-level SDK boundary for desktop-specific storage and IPC transport
injection. Renderer feature modules should still call the desktop conversation
runtime facade; the facade is allowed to use SDK runtime internals so Electron
does not duplicate conversation, projection, edit/resend, retry, or rehydrate
semantics.

`conversation.stream(input)` is the preferred custom-client loop API. It emits
normalized SDK runtime events, updates the configured conversation store, and
terminates when the projected runtime phase reaches `completed`, `stopped`, or
`error`. Pass `model` on the input when a custom UI wants a per-turn model
change without manually calling `agent.setModel(...)` first.

`agent.listConversations()` lists metadata from the agent's default conversation
store. `agent.loadConversation(conversationRef)` is the startup shorthand for
loading a projected snapshot; pass `agent.loadConversation({ conversationRef,
store, revisionId })` when a host needs a specific store adapter or revision
seed. Use `FileConversationStore` when a Node CLI or custom UI needs durable
local JSON state without Electron.

For a minimal non-Electron consumer, see `examples/cli-agent`. It uses
`WindieClient.wakeUp`, `agent.conversation`, `FileConversationStore`, and
`conversation.stream()` against a mock websocket backend.

For the simplest interactive chat script against the remote backend, see
`examples/simple-chat-cli`. It wakes an agent, creates `agent.chat(...)`, reads
terminal input, and streams assistant text to stdout.

The frontend SDK test suite includes a mock-backend end-to-end contract that
starts `scripts/mock-backend.cjs`, wakes `WindieClient`, registers a module tool
through a fake local runtime, streams a turn, returns the local tool result over
the websocket transport, and verifies the completed conversation projection.

For a browser-based custom UI that renders SDK display projections directly,
see `examples/custom-ui`.

The public examples intentionally exercise the modular runtime controls:

- `examples/cli-agent` uses `FileConversationStore`, streams a turn, retries
  through `conversation.retryTurn(...)`, and stops through
  `conversation.stop(...)`.
- `examples/custom-ui` uses `InMemoryConversationStore`, renders SDK display
  projections, changes models through `conversation.setModel(...)`, and exposes
  Retry and Stop controls.
- `examples/local-tool-extension` registers a module tool through the sidecar,
  streams local tool execution with request/provider tool ids, returns the tool
  result to the backend, and stops through `agent.stop(...)`.
- `examples/repo-agent-extension` loads a plugin package, registers the local
  repo-inspection tool, streams provider-safe tool history, and stops through
  `agent.stop(...)`.

For the smallest local tool authoring path, see `examples/local-tool-extension`.
It uses `moduleTool(...)` to register a Python `module:function` entrypoint with
the sidecar daemon and lets the SDK return the tool result to the backend.
