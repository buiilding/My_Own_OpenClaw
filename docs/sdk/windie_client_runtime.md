---
summary: "Final AgentClient runtime contract for SDK callers, Electron main, local hosted query routing, hosted backend websocket ownership, SDK WebSocketLike typing, Python local-runtime daemon registration through the local runtime, builtins wakeUp option selection, removed builtinTools wake guard behavior, AgentStreamEvents extractToolResultAttachments attachment projection, and tool-result routing."
read_when:
  - When changing `AgentClient.wakeUp`, builtins selection, local hosted query routing, backend websocket ownership, or Python local-runtime daemon integration.
  - When debugging whether a query should use the hosted backend websocket, the local runtime daemon, or both.
  - When changing SDK websocket implementation selection, `WebSocketLike`/`WebSocketConstructor` types, the `ws` package dependency, or stale references to the removed `src/types/ws.d.ts` ambient declaration.
  - When changing SDK `agent.stream(...)` tool-output attachment extraction, `AgentStreamEvents.ts`, or stale `extractToolResultAttachments` parent-parameter references.
  - When debugging stale `builtinTools` wakeUp option calls, the removed builtinTools wake guard, or current `builtins` agent setup.
  - When adding SDK, CLI, Electron, plugin, MCP, or module-tool entrypoints.
  - When debugging Python SDK camelCase `toolName`/`requestId`/`bundleId` payloads that are ignored because Python local tool execution reads backend-wire snake_case fields.
title: "AgentClient Runtime Contract"
---

# AgentClient Runtime Contract

## Runtime Boundary

`AgentClient` is the canonical agent client runtime, and the returned agent
object is exported as the generic `Agent` class. The old Windie-prefixed client
and agent wrapper modules have been removed so reusable hosts import the
generic SDK names directly.

```text
Electron main / future CLI / SDK users
        |
        v
TS Agent SDK runtime
        |---------------- hosted backend HTTP/WebSocket
        |
        |---------------- local runtime daemon HTTP/WebSocket
                              |
                              |-- built-in tools
                              |-- module-path tools
                              |-- plugin tools
                              |-- MCP tools
```

Query routing boundary:

- Hosted query turns use the backend websocket opened by the SDK runtime.
- Local desktop authority is delegated to the SDK local runtime, implemented by
  the Python local-runtime daemon in the desktop app, for executable tools, local
  memory, screenshots, shell/filesystem, browser, computer-use, and
  local-runtime status calls.
- `AgentClient.wakeUp(...)` is the path that combines both: it connects the
  hosted backend conversation session, starts or reuses the local runtime when
  needed, contributes the client tool manifest, and returns local tool results
  to the backend agent loop.
- `AgentClient.localRuntime(...)` is local-only. It can execute local runtime tools
  and inspect status without creating a hosted backend websocket, agent
  conversation, or model turn.

Ownership rules:

- SDK runtime owns hosted backend HTTP/WebSocket connection, handshake, query,
  stop, settings, event fan-out, normalized conversation events, display
  projections, diagnostic rehydrate snapshots, model-history resume,
  edit/retry revision semantics, and tool-result return.
- the SDK transport module owns websocket session framing, backend event fan-out,
  and the conversation transport adapter used by `ConversationRuntime`. That
  adapter exposes query, rehydrate, stop, tool-result, settings-update, and
  list-models websocket commands as one typed backend boundary.
- the SDK transport module owns the websocket type surface. `AgentSession.ts`
  defines the public `AgentSessionOptions`, `AgentQueryInput`,
  `AgentStopInput`, `AgentSessionRuntime`, `AgentSession`,
  `createAgentSession`, and `createAgentRuntimeTransport` contracts alongside
  `WebSocketLike` and `WebSocketConstructor`. `AgentSession.ts` is the
  canonical websocket session module. The older
  `createAgentBackendTransport` compatibility alias has been removed so host
  adapters use the runtime-named factory directly.
  `BackendSocketFactory.ts` exposes
  `createAgentBackendSocket` and `AgentBackendSocketOptions`.
  The lower-level `ManagedWebSocketSession.ts` implementation is private to the
  SDK transport package; the package root exposes the agent-shaped managed
  session instead of a websocket-lifecycle class.
  `ManagedAgentSession.ts` is the canonical managed
  hosted session module through `ManagedAgentBackendEndpoint`,
  `ManagedAgentSessionOptions`, `ManagedAgentSession`, and
  `createManagedAgentSession`.
  The package still depends on runtime `ws` for Node sockets, but it no
  longer carries a local `src/types/ws.d.ts` ambient declaration; TypeScript
  declaration output comes from the SDK-owned websocket-like interfaces.
- Electron main exposes only non-tool typed websocket commands to app callers;
  backend tool-result sends are internal to SDK tool coordination after a
  claimed backend tool event.
- the SDK hosted HTTP transport owns model listing, prompt/query-plan
  introspection, artifact upload URLs, OCR routes, and vision routes exposed to
  public SDK callers. TypeScript and Python hosted clients filter POST payloads
  to the backend route models before JSON serialization so caller-local UI,
  replay, tracing, and compatibility fields do not reach strict Pydantic
  request contracts. TypeScript callers should prefer the generic
  `AgentHostedBackendClient`, `AgentHostedBackendClientOptions`,
  `AgentSdkQueryOptions`, and `AgentInstallIdentityResponse` names for
  reusable SDK host code.
- the SDK local-runtime module owns daemon HTTP calls, daemon discovery,
  auto-start/reuse, local runtime event subscriptions, local-runtime-backed conversation
  storage, builtin desktop tool selection, memory/title RPC helpers, and
  `moduleTool(...)` registration helpers.
- the SDK `AgentClient` runtime module owns wake-up orchestration, websocket
  session creation, initial model selection, local-runtime startup/reuse, and
  conversion of local tool/plugin/MCP definitions into the client manifest.
  TypeScript callers that omit `workspacePath` get a runtime-derived workspace:
  `process.cwd()` first, then the best available home-directory environment
  path.
- the SDK `Agent` runtime module owns live MCP manifest refresh
  after an agent is already awake. `Agent.registerMcps([...], { replace: true })`
  registers the requested MCP servers through the local runtime, reads the
  refreshed local tool manifest, sends a backend `update-settings` command with
  `tools.mode = replace_client_manifest`, mutates the SDK agent definition, and
  includes that updated client manifest on the next `ask`, `run`, `stream`, or
  conversation send.
- the Agent SDK stream-event module owns the public event projection from
  normalized conversation events to high-level `agent.stream(...)` events,
  including duplicate tool-output suppression for local/backend acknowledgements.
- the SDK `Agent` runtime module owns high-level agent helpers such as
  `ask`, `run`, `stream`, `chat`, model updates, conversation creation,
  conversation listing/search/loading/deletion over a store adapter, memory
  commands, title commands, system prompt/tool-schema commands, and artifact
  helpers.
- local runtime daemon owns local execution only.
- backend owns model/provider selection, paid capability gates, OCR/vision/prediction/web-search availability, prompt construction, session policy, and remote/backend tools.
- Electron owns windows, renderer IPC, overlays, permission prompts, display/screenshot integration, and settings UI.

Local runtime facts must not unlock backend capabilities. In particular, coordinate methods are backend policy/provider outputs. The client can report or narrow local executable tools; it cannot grant OCR, vision, prediction, or paid backend capabilities.

SDK consumers can use local runtime/tool execution independently from the agent
loop. `AgentClient.localRuntime(...)`, `executeTool(...)`, `rpc(...)`,
`listLocalTools(...)`, and `localStatus(...)` start or reuse the SDK-owned local
runtime without creating an `Agent`, backend websocket, conversation, or
model turn. Use `AgentClient.wakeUp(...)` when the caller wants the full agent
conversation path: agent definition, websocket/session, local-runtime manifest,
tool-result return, and store wiring.

Desktop-style agent clients should create one client with managed backend
connection settings, call `wakeUp(...)`, then create a conversation runtime from
the returned agent. The SDK owns websocket normalization,
reconnect, endpoint fallback, idle policy, local tool routing, backend result return,
conversation projections, retry/edit/rehydrate helpers, model/settings commands,
and memory/title helpers. The host renders projections and supplies only
host-specific policies such as Electron window leases.

Conversation selection belongs on `agent.conversation(...)` and conversation
commands such as `send`, `rehydrateMessages`, and `compactHistory`, not on a
parallel desktop wrapper. The built-in Electron desktop is a first-party SDK
customer, not a separate agent runtime. Electron-specific adapters may implement
SDK interfaces like `ConversationStore` and `LocalToolExecutionLifecycle`, but
Electron must not reimplement SDK behavior separately.

`agent.chat(...)` returns the generic `AgentChatSession` convenience wrapper
over `SdkConversationRuntime`. `AgentChatSession.ts` is the canonical chat
session module; the old Windie-prefixed chat session module has been removed so
host code uses the `AgentChat*` names directly. Chat-session event subscribers
use `AgentChatSession.onEvent(...)`; duplicate event-listener method aliases are
not part of the SDK surface. Chat method parameters use the direct runtime
input types (`SendInput`, `EditAndResendInput`, and `RetryTurnInput`) instead of
extra `AgentChat*Input` aliases.
Likewise, public agent API option and result shapes use generic `Agent*` names
such as `AgentQueryOptions`, `AgentStopOptions`, `AgentTraceOptions`,
`AgentMemoryQuery`, and `AgentStoreMemoryInput`. Client-level runtime options
follow the same rule: use `AgentClientOptions`, `AgentWakeUpOptions`,
`AgentLocalRuntimeRequest`, `AgentRuntimeFeatureOption`, and
`AgentInstallAuthOptions` in reusable SDK code.
High-level `agent.stop(...)` option objects accept `conversationRef` and
`turnRef`; `AgentSessionRuntime.stopQuery(...)` uses the same camelCase input
shape. Snake_case stop fields are reserved for backend transport payloads and
are emitted only by SDK transport adapters.
`ManagedAgentSession` reuses the same `AgentSession` stop-alias guard so
managed and unmanaged hosted sessions do not keep separate compatibility checks.

## Host UI Startup

Normal host UIs start one SDK-owned runtime and render the SDK
conversation projection:

```ts
import { AgentClient } from "@windie/sdk";

const client = new AgentClient({
  backendUrl: "https://backend.example.com",
  backendSession: "managed",
  installToken: process.env.AGENT_INSTALL_TOKEN
});

const agent = await client.wakeUp({
  name: "Desktop Agent",
  workspacePath: "/Users/me/project",
  builtins: "default"
});

const conversation = agent.conversation();
conversation.subscribeEvents((event, snapshot) => {
  renderRows(snapshot.displayRows);
  recordEvent(event);
  renderTurn(snapshot.currentTurn);
});

await conversation.send({ text: "Find the longest line of code in this repo" });
await conversation.stop();
```

Electron main uses the same SDK shape through the generic `AgentClient` alias
and remains a shell customer. Its only
desktop-specific tool hook is a narrow lifecycle callback around SDK-local tool
execution:

```js
const client = new AgentClient({
  backendUrl: backendEndpointState.getHttpUrl(),
  backendEndpoints: backendEndpointState.getCandidates(),
  backendSession: 'managed',
  reconnectIntervalMs: 1000,
});

const agent = await client.wakeUp({
  installAuth: buildDesktopInstallAuth(),
  name: mainHostSkin.identity.sdkAgentName,
  workspacePath: activeWorkspacePath,
  builtins: 'default',
  localToolLifecycle: electronToolSurfaceLifecycle,
});

const conversation = agent.conversation();
conversation.subscribeEvents((event, snapshot) => {
  broadcastToRenderers('windie:conversation-event', event);
  if (event.type === 'memory_store_changed') {
    broadcastToRenderers('windie:memory-store-changed', event);
  }
  broadcastToRenderers('windie:rows', snapshot.displayRows);
  broadcastToRenderers('windie:current-turn', snapshot.currentTurn);
});

ipcMain.handle('windie:invoke', (_event, { command, payload }) => {
  if (command === 'conversation.send') {
    return conversation.send(payload);
  }
  if (command === 'conversation.stop') {
    return conversation.stop(payload?.turn_ref ?? null);
  }
  throw new Error(`Unsupported Agent SDK command: ${command}`);
});
```

Renderer-facing user commands that are SDK concepts should use SDK command
names with the renderer command payload contract instead of local-runtime RPC
method names.
Backend transport commands such as `conversation.send`, `conversation.stop`,
`conversation.rehydrate`, and `conversation.compact` use canonical snake_case
fields at this IPC boundary. SDK library commands such as
`conversations.list`, `conversation.loadDisplay`, and memory commands use the
public SDK camelCase option shape at the same allowlist boundary:

```js
ipcMain.handle('windie:invoke', async (_event, { command, payload }) => {
  switch (command) {
    case 'memories.clearAll':
      return agent.clearMemories(payload);
    case 'conversations.clearAll':
      return agent.clearConversations(payload);
    case 'conversation.send':
      return agent.conversation({ conversationRef: payload.conversation_ref })
        .send(payload);
    case 'conversation.stop':
      return agent.conversation({ conversationRef: payload.conversation_ref })
        .stop(payload.turn_ref ?? null);
    case 'conversation.rehydrate':
      return agent.rehydrateMessages(payload);
    case 'conversation.compact':
      return agent.compactHistory(payload);
    default:
      throw new Error(`Unsupported SDK command: ${command}`);
  }
});
```

The command allowlist belongs in Electron main. The behavior and semantics
belong in public SDK methods on `Agent`, `ConversationRuntime`, or SDK
stores.

The `localToolLifecycle` callback is SDK-owned in timing and host-owned in
policy. The SDK calls `beforeExecute(call)` immediately before local-runtime
execution and awaits the returned release callback in `finally`. Electron uses
that hook for pointer-control and screenshot-capture leases. The SDK still owns
tool order, result correlation, implicit post-action screenshots, and backend
tool-result return.

## Public API

```ts
import { AgentClient, agentBuiltins, moduleTool } from "@windie/sdk";

const client = new AgentClient({
  backendUrl: "https://backend.example.com"
});

const simpleAgent = await client.wakeUp({
  systemPrompt: "You are a helpful assistant. Be concise. This text-only client has no callable tools.",
  ...agentBuiltins.none(),
  // Memory and persistence default on. Set both false for a stateless backend-only client.
});

const agent = await client.wakeUp({
  systemPrompt: "You are a concise coding agent.",
  workspacePath: "/Users/me/project",
  builtins: ["filesystem", "shell"],
  model: {
    modelProvider: "hosted-provider",
    modelId: "hosted-model-balanced",
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

`builtins` is the only SDK wake-up option for selecting built-in local-runtime tool
groups. Valid current shapes are `"default"`, `"none"`, or an array such as
`["filesystem", "shell"]`. The old `builtinTools` option is removed and no
longer has a dedicated wake guard or compatibility error branch in
`AgentClient.wakeUp(...)`; callers must move to `builtins` instead of expecting
the SDK runtime to special-case stale `builtinTools` input.
The package root exposes the public `agentBuiltins` helper and builtin
selection types. The lower-level `shouldIncludeBuiltinTool(...)` matcher is an
`AgentClient` implementation helper and stays importable only from the
`tools/builtins` owner module, not from the package entrypoint.

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
  modelProvider: "hosted-provider",
  modelId: "hosted-model-deep",
  modelMode: "online",
  interactionMode: "agent"
});

for await (const event of conversation.stream({
  text: "Run the test command with this model and report progress.",
  model: {
    modelProvider: "hosted-provider",
    modelId: "hosted-model-deep"
  }
})) {
  if (event.type === "conversation_event" && event.event.type === "assistant_delta") {
    process.stdout.write(String(event.event.payload.text ?? ""));
  }
}

for await (const event of agent.stream("Run the test command and report progress.")) {
  if (event.type === "assistant_delta") {
    process.stdout.write(event.text);
  }
  if (event.type === "tool_calls") {
    for (const call of event.calls) {
      console.log(`using ${call.toolName}`);
    }
  }
  if (event.type === "tool_outputs") {
    for (const output of event.outputs) {
      console.log(`${output.toolName}: ${JSON.stringify(output.result)}`);
    }
  }
}

await agent.ask("Use the fast model for this one-shot query.", {
  model: {
    modelProvider: "hosted-provider",
    modelId: "hosted-model-fast",
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
  if (event.type === "assistant_delta") {
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

`conversation.editAndResend({ messageId, ... })` and explicit
`conversation.retryTurn({ messageId })` use canonical SDK event or payload
message ids only. They do not accept renderer-only transcript ids or
user-message ordinal fallbacks.

`wakeUp` performs this sequence:

1. Resolve the hosted backend URL from `backendUrl`, `httpBaseUrl`,
   `AGENT_BACKEND_URL`, or the legacy `WINDIE_BACKEND_URL`; hosted operations
   fail fast when no backend URL is configured.
2. Resolve install auth from `installToken`; callers that want the hosted
   install-registration route set `installAuth.autoRegister = true` explicitly
   so backend auth policy stays outside endpoint-name inference.
3. Normalize feature flags. `memory` and `persistence` both default to enabled.
4. Ensure a local runtime client is available when memory, persistence,
   builtins, module tools, plugins, or MCPs need local runtime support.
5. Select the default conversation store: `LocalRuntimeConversationStore` when
   persistence is enabled, otherwise `InMemoryConversationStore`.
6. Register module/plugin/MCP tools with the local runtime.
7. Read the local runtime tool manifest.
8. Build the low-level backend `agent_definition`.
9. Connect to the backend websocket.
10. Send the websocket handshake with `agent_definition`; SDK transports put
    detected OS facts under `agent_definition.runtime.operating_system` and do
    not emit removed top-level handshake capability fields.
11. Normalize backend events into SDK conversation events.
12. Route backend events to callers and route local `tool-call` events to the local runtime.
13. Project display transcript from normalized events and install persisted
    model-history checkpoints for backend resume.

SDK env fallback names are defined in `runtime/RuntimeEnv` as named key groups.
The reusable `AgentClient` and local-runtime provider consume those key groups
instead of spelling product-specific compatibility aliases inside orchestration
methods. Generic hosts should prefer `AGENT_*`; the legacy `WINDIE_*` names
remain compatibility aliases in the `AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS`
contract only.

Set both `memory: false` and `persistence: false` when a client wants a
stateless backend-only session and does not request local builtins, module
tools, plugins, or MCPs. In that case `wakeUp` does not require or start a
local runtime.

Standalone local tool callers should use the root client instead of creating an
agent solely to reach the local runtime:

```ts
const client = new AgentClient({ autoLocalRuntime });
await client.executeTool({
  toolName: "browser",
  args: {
    action: "connect",
    explanation: "Open the dedicated browser."
  }
});
const status = await client.localStatus();
```

When a local runtime supports events, callers can subscribe through the SDK
runtime instead of connecting to the local daemon directly:

```ts
const unsubscribe = agent.subscribeLocalRuntimeEvents((event) => {
  if (event.type === "conversation-title-updated") {
    // Refresh conversation metadata in the host UI.
  }
});
```

`agentBuiltins` is the generic SDK helper for selecting built-in local tool
sets.

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
Durable store adapters that use read-modify-write persistence must serialize
same-conversation mutations so overlapping appends cannot overwrite each other.

SDK adapter contracts export named payload types for the core runtime boundary:
`AgentDefinition`, `QueryPayload`, `ToolResultPayload`,
`ToolBundleResultPayload`, `RehydratePayload`, `StopPayload`,
`LocalRuntimeStatus`, `LocalToolManifest`, and `ToolRegistration`. Adapter
implementations should use those types rather than accepting unstructured
records for query, rehydrate, stop, tool-result, and local-runtime operations.

Electron uses the SDK `LocalRuntimeConversationStore` through a desktop store factory:

`stores/LocalRuntimeConversationStore` is the canonical module path.

- canonical SDK events are stored in the local-runtime `conversation_events`
  table as the storage truth for desktop display and backend rehydrate
- transcript/replay fallback is removed; conversations that participate in the
  SDK runtime must load from canonical `conversation_events` rows
- compacted replay snapshots are persisted as `compaction_applied` conversation
  events with complete generation payloads, not as hidden replay rows
- desktop compaction replacement-history writes go through the desktop
  conversation continuity service into
  `LocalRuntimeConversationStore.replaceCompactedReplay(...)` instead of stream
  handlers or the live-turn facade directly mutating replay storage
- compacted replay replacement appends a new generation with entry count and
  completion metadata; loaders keep using the previous complete generation if a
  newer write is partial
- desktop backend-session rehydrate uses SDK model-history checkpoints instead
  of shaping messages directly from visible transcript rows or event
  projections
- desktop recent-chat and open-chat loading use store metadata/display
  projections over canonical event rows only
- desktop chat deletion goes through the SDK `LocalRuntimeConversationStore` and
  removes canonical `conversation_events` rows
- startup metadata loading does not apply a hidden local chat limit; SDK callers
  pass explicit `listMetadata({ limit, cursor })` options when they want bounded
  pages. `cursor` is the last `conversationRef` from the previous page.
- Electron store event loading preserves the local-runtime row append order from
  `message_index` pagination. It must not re-sort events by timestamp or event
  id because same-timestamp turns, tool pairs, and assistant commits depend on
  append order.
- desktop edit/resend and try-again visible transcript rewrites are routed
  through `DesktopConversationContinuityService`, active display timeline
  loading, `conversation.replaceRows`, and a normal send. Raw
  `conversation_events` remain append-only audit history; replacement state is
  stored as display timeline checkpoints and bounded model-history checkpoints.
  Local-runtime metadata and `getRevision()` follow the active display/model
  revision instead of deleting and rewriting event rows.
- desktop visible transcript state routes through SDK conversation events and
  the desktop conversation store factory, so renderer feature code no longer
  owns direct row IPC, replay append mutation, or retry queues.
- desktop chat feature code uses the transcript-session runtime facade for
  active conversation/user identity, while user, assistant, and tool transcript
  writes go through focused chat-feature persistence helpers into the SDK-backed
  projection runtime instead of through the live-turn facade.
- desktop dashboard and app config session synchronization use an app-level
  transcript-session runtime facade, so feature/provider code does not import
  transcript infrastructure directly for conversation/user identity updates.
- desktop dashboard conversation list/load/delete/search commands use
  `DesktopConversationLibraryClient`, which delegates directly to the SDK store
  factory.
- desktop chat and dashboard local snapshot loading also go through
  `DesktopConversationContinuityService` or `DesktopConversationLibraryClient`,
  so feature code does not import transcript snapshot loaders directly.
- desktop manual compaction controls share one rehydrate-first runtime helper
  that uses the SDK store-backed conversation rehydrate path before sending
  `compact-history` through `DesktopConversationContinuityService`.
- desktop chat feature code routes deferred query-time model/provider sync
  through `DesktopSettingsRuntimeClient`, not through the conversation command
  facade.
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
  projections and diagnostic rehydrate snapshots keep model changes out of
  visible chat rows and provider history.
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
  dedupe and exposes provider-safe `toolCallId` on synthetic tool-call events.
  Its top-level tool call/output inputs are SDK-shaped fields such as
  `toolName`, `requestId`, and `toolCallId`; direct backend-wire aliases such
  as `tool_name`, `request_id`, `tool_call_id`, and `parameters` are not public
  stream inputs. Provider/model-facing metadata and normalized bundle step rows
  remain valid sources for provider ids, function arguments, and bundle step
  names.
- SDK tool correlation helpers own display/projection alias resolution for
  `requestId`, `toolCallId`, `correlationId`, and `bundleId` across camelCase
  SDK events and snake_case backend payloads. The runtime reducer also uses
  these helpers for pending tool waits, so provider-safe `toolCallId` can close
  a pending tool when request ids are unavailable. Electron store/projection
  adapters and renderer chat utilities may call the canonical identity
  resolvers through the SDK barrel, but they should not maintain separate
  backend-alias parsers. Lower-level pairing and dedupe key builders such as
  `resolveToolPairKeys(...)`, `resolveToolOutputDedupeKey(...)`, and
  `resolveToolOutputCorrelationKeys(...)` are SDK projection/runtime internals
  owned by `tools/toolCorrelationIds`, not package-root API.
- the Electron main-process SDK tool router accepts canonical SDK identity fields
  (`requestId`, `toolCallId`, `correlationId`, `bundleId`) before emitting
  backend wire payloads.
- the TypeScript SDK backend-event normalizer owns backend snake_case to
  SDK-shaped tool event conversion before local execution or public stream
  projection. Field-level coordinator payload rules live in
  `conversation_runtime.md`; direct snake_case SDK tool events are unclaimable
  and do not provide public stream identity.
- the Python SDK websocket session treats backend `tool-call` and `tool-bundle`
  payloads as backend-wire snake_case. It reads `tool_name`, `request_id`,
  `correlation_id`, `tool_call_id`, `bundle_id`, and bundle step `name` /
  `tool_call_id`; stale camelCase payload keys such as `toolName`, `requestId`,
  `correlationId`, `toolCallId`, or `bundleId` are not local-execution inputs.
  When canonical fields are present, the Python session forwards request,
  provider, correlation, and bundle identities into local runtime
  `execute_tool(...)` calls so local runtime execution can preserve SDK-owned tool
  routing state.
- the Python SDK websocket session renders attachment bodies into the required
  backend `query.payload.content`, keeps attachment filenames out of backend
  query payloads, filters `update-settings` patches to backend-accepted keys, and
  drops incomplete screenshot `capture_meta` from local runtime tool results before
  returning them to backend history.
- direct TypeScript SDK websocket sessions use the same backend payload
  normalization before `query`, `update-settings`, `rehydrate-conversation`,
  `compact-history`, `wakeword-detected`, `tool-result`, and
  `tool-bundle-result` sends, so standalone clients do not rely on Electron main
  to strip renderer-only or stale fields.

Skipped compaction is represented as `compaction_skipped`. It is runtime/debug
state and should not render as assistant output or a full compacted-history panel
in normal UI.

## Low-Level Agent Definition

`agent_definition` remains the hosted backend wire contract, not the normal authoring surface.

The SDK builds:

```json
{
  "version": 1,
  "id": "agent-...",
  "name": "Agent",
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

The SDK wake-up path uses the generic `Agent` display name when `name` is not
provided. Product-specific names should be supplied by the host skin/config
layer, such as Electron main's `mainHostSkin.identity.sdkAgentName`.

`runtime.operating_system` is detected by the SDK runtime. If callers omit
`workspacePath`, the TypeScript SDK detects `runtime.workspace_path` from the
current process path, falling back to the user home path when the runtime exposes
one.

## Local Runtime Options

`AgentClient.localRuntime()` and `AgentClient.wakeUp()` resolve the local
runtime through the same SDK manager. Electron main does not create a daemon
HTTP client or a second local-runtime provider for the desktop daemon path.
Instead, Electron computes desktop launch options (Python or packaged daemon
command, args, cwd, environment, auth/permission paths, discovery path, and
launch context) in `ipc_electron_agent_client_factory.cjs`, passes them as
`autoLocalRuntime` to one shared `AgentClient`, and hands
`client.getKnownLocalRuntime()` / `client.localRuntime({ reason })` resolvers to
host IPC facades such as browser control and local-runtime status.

The SDK auto-local-runtime provider reads the daemon discovery file, validates launch
context when one is provided, starts or reuses the configured daemon command or
script, owns
`AgentLocalRuntimeHttpClient`, unwraps JSON-RPC `/rpc` responses before callers
see them, and exposes the runtime to memory, persistence, tool registration,
and local tool execution. Discovery files are daemon-authored snake_case
metadata: the SDK accepts `base_url` plus `token` and rejects stale camelCase
discovery metadata such as `baseUrl`.
Electron remains responsible for host-only behavior around native windows,
screenshots, display bounds, and artifact upload plumbing.

By default, the provider shuts down a healthy discovered daemon and starts a fresh
one. Set `autoLocalRuntime.reuseExisting = true` only for hosts that intentionally want
to attach to a daemon whose launch context matches the supplied options.

Non-Electron SDK hosts can override that behavior with:

- `autoLocalRuntime`: daemon script or explicit command/args, discovery file,
  host/port, timeout, cwd, env/env mode, optional launch context, Python command,
  and optional `pythonArgs` launcher prefix for the default Node provider.
  Hosts can use this to supply a project-specific Python launcher while leaving
  daemon discovery, registration, JSON-RPC unwrapping, and shutdown with
  `AgentClient`. Node and Python SDK hosts that rely on an environment override
  use `AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT`; legacy
  `WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT` remains supported, while the older
  implementation-specific env override is not part of the SDK local-runtime
  contract.
  The SDK does not guess WindieOS repository paths for the daemon. Hosts must
  pass `autoLocalRuntime.command`, pass `autoLocalRuntime.daemonScript`, or set
  `AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT`.
- `ensureLocalRuntime`: an async provider that starts/reuses a daemon and returns
  an `AgentLocalRuntimeClient` when `localRuntime()` or `wakeUp()` needs local
  execution.
- `localRuntime`: a custom `AgentLocalRuntimeClient` implementation.
- `localRuntimeDaemon`: public client option for an already-known daemon `baseUrl`
  and per-process `token`; `AgentClient` creates an `AgentLocalRuntimeHttpClient`
  and uses `/status`, registration endpoints, `/tools`, and `/execute-tool`.
  This camelCase `baseUrl` option does not change the daemon discovery-file
  contract, which remains canonical `base_url`.
- `memory`: enabled by default. When enabled, the SDK obtains backend embeddings,
  asks the local runtime memory index for relevant local memories, injects them into
  model-facing user content, and stores completed turns as episodic memory.
- `persistence`: enabled by default. When enabled, `agent.chat()` and
  `agent.conversation()` use the local-runtime-backed default conversation store so
  chat event history survives process restart.

`AgentToolDefinition`, `AgentLocalRuntimeClient`, `createAgentLocalRuntimeProvider`,
and related `Agent*` local-runtime names are the generic SDK contract surface.
The SDK no longer exposes the historical `Windie*` local-runtime aliases; SDK
callers should import the `Agent*` local-runtime names directly.
Python callers use the same boundary names for explicit local executors and
daemon startup knobs: `local_runtime`, `local_runtime_discovery_file`, and
`local_runtime_daemon_script`.

The default auto provider is Node-only. Browser-hosted SDK consumers should pass
`localRuntime`, `localRuntimeDaemon`, or `ensureLocalRuntime` explicitly
when they need local execution.

After any SDK path resolves a local runtime, `AgentClient.status()`,
`AgentClient.listTools()`, `AgentClient.getKnownLocalRuntime()`, and
`AgentClient.shutdownLocalRuntime()` operate on that known runtime. `status()`
and `listTools()` remain non-starting inspection helpers. Use
`localStatus()` and `listLocalTools()` when the caller intentionally wants to
start/reuse the local runtime for inspection. The returned `Agent` exposes
the same local-runtime status/tool-list/shutdown helpers, so SDK hosts can keep
using the agent object after wake-up instead of retaining the root client.
These agent helpers do not auto-start a daemon just to inspect status.
Use `agent.shutdown()` for CLI and custom SDK host teardown; it closes the
backend websocket and then shuts down the known local runtime. `agent.sleep()`
only closes the backend session.

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
backend tool-call -> SDK conversation runtime -> SDK local runtime /execute-tool -> backend tool-result
```

`AgentSession` is now transport-only. It connects, handshakes, sends
queries/results, and emits backend-wire events. It does not execute local tools.
`ManagedAgentSession` is backed by an internal managed websocket lifecycle for
connection waiters, reconnect scheduling, endpoint advance, idle disconnect,
typed backend sends, and backend-wire event parsing. Electron main consumes
that SDK package transport and only supplies host-specific socket construction,
headers, handshake data, local tool execution, and renderer fan-out.
Close metadata reports whether a reconnect was already scheduled as
`reconnectScheduled`; endpoint fallback notifications remain on the explicit
`onBackendFallback`/`onFallback` hooks.
The internal managed websocket implementation uses a direct
`() => WebSocketLike` socket factory; there is no separate
`ManagedBackendSocketFactory` alias.
An opened socket is not considered a connected managed session until handshake
construction and `send()` both succeed. If handshake construction or the
handshake send fails, the managed session closes and clears that socket,
rejects connection waiters, and requires a fresh connection attempt before any
typed backend send can succeed.
`agent.stream(...)` and `agent.conversation(...).stream(...)` both run through
`SdkConversationRuntime`, which owns local tool execution when a local runtime
adapter is available.
SDK backend event normalization requires explicit `conversation_ref`; turn-only
or session-only events remain raw debug events and are not appended to the
conversation store.

## Public Methods

Current canonical surface:

- `localRuntime`
- `getKnownLocalRuntime`
- `executeTool`
- `rpc`
- `listLocalTools`
- `localStatus`
- `wakeUp`
- `ask`
- `query`
- `stop`
- `sleep`
- `shutdown`
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

`agent.subscribeRawBackendEvents(listener)` is the intentionally raw-named
debug surface. It receives typed backend websocket events before conversation
projection and returns an unsubscribe function. Normal app authors should use
`agent.stream(...)`, `conversation.stream(...)`, or
`conversation.subscribe(...)`; backend-wire events are for trace tools, tests,
and protocol debugging only. The listener uses the direct
`(event: BackendEvent) => void` shape; there is no separate exported raw-named
listener alias. The backend-wire normalizer is also not re-exported from the
top-level SDK package; application code should consume SDK projections and chat
streams instead of normalizing hosted backend packets directly.

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

`AgentModelSelection` is the generic SDK type for that camelCase selection.

Desktop model changes now route through the renderer settings runtime facade
before they reach the low-level IPC adapter. Chat features should call
`DesktopSettingsRuntimeClient.setModel(...)`; that facade builds the same SDK
model-selection patch used by public `AgentClient` callers. Feature code
should not shape `update-settings` payloads, route model sync through the
live-turn facade, or call the backend API adapter directly.

`stream(input, options)` returns an `AsyncIterableIterator<AgentStreamEvent>`.
It is a high-level projection over `SdkConversationRuntime.stream()`: it
stores normalized events, preserves `conversationRef`/`turnRef`, routes local
tool calls through the SDK coordinator, and maps runtime events into
consumer-ready `state`, `reasoning_delta`, `assistant_delta`,
`assistant_message`, `tool_calls`, `tool_outputs`, and `error` items. Bundled
tool calls and bundled tool outputs stay bundled on the backend transport and
conversation history path, but the public stream exposes them as plural tool
call/output arrays so CLI and custom UI callers do not need bundle-specific
rendering branches.

`AgentStreamEvents.ts` owns display-safe public tool-output extraction for
`agent.stream(...)`. `extractToolResultAttachments(...)` walks nested arrays and
objects, removes large binary/image fields from `tool_outputs[].result`, and
emits those fields as public stream `attachments` with field paths, keys,
content type, kind, and length metadata. The helper now threads only the current
field path during recursion; the removed `parent` parameter was not part of the
public SDK contract.
The package root exports the public stream event types such as
`AgentStreamEvent`. Mapper and dedupe behavior is exposed to SDK runtime
classes through `createAgentStreamEventRuntime(...)`, while lower-level helpers
such as `toAgentStreamEvents(...)` and `toolOutputStreamKeys(...)` remain
private to the `runtime/AgentStreamEvents` module and outside the package
entrypoint.

`conversation(options)` returns an SDK conversation runtime backed by the agent
session transport. It is the migration path for clients that need local event
storage, display projections, rehydrate snapshots, stop handling, streaming,
and edit/retry revision operations.

`createConversationRuntime(options)` is the host-adapter factory for clients
that already have a `ConversationStore` and `AgentRuntimeTransport`. Electron
uses this lower-level SDK boundary for desktop-specific storage and IPC
transport injection. Renderer feature modules should still call the desktop
conversation runtime facade; the facade is allowed to use SDK runtime internals
so Electron does not duplicate conversation, projection, edit/resend, retry, or
rehydrate semantics.
`AgentRuntimeTransport` is the canonical reusable conversation-runtime
transport type. The older `BackendTransport` compatibility type has been
removed; SDK callers and host adapters should use `AgentRuntimeTransport`.

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
`AgentClient.wakeUp`, `agent.conversation`, `FileConversationStore`, and
`conversation.stream()` against a mock websocket backend.

For the simplest interactive chat script against the remote backend, see
`examples/simple-chat-cli`. It wakes an agent, creates `agent.chat(...)`, reads
terminal input, and streams assistant text to stdout.

The frontend SDK test suite includes a mock-backend end-to-end contract that
starts `scripts/mock-backend.cjs`, wakes `AgentClient`, registers a module tool
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
- `examples/local-tool-extension` registers a module tool through the SDK local runtime,
  streams local tool execution with request/provider tool ids, returns the tool
  result to the backend, and stops through `agent.stop(...)`.
- `examples/repo-agent-extension` loads a plugin package, registers the local
  repo-inspection tool, streams provider-safe tool history, and stops through
  `agent.stop(...)`.

For the smallest local tool authoring path, see `examples/local-tool-extension`.
It uses `moduleTool(...)` to register a Python `module:function` entrypoint with
the local runtime daemon and lets the SDK return the tool result to the backend.
