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
- sidecar daemon owns local execution only.
- backend owns model/provider selection, paid capability gates, OCR/vision/prediction/web-search availability, prompt construction, session policy, and remote/backend tools.
- Electron owns windows, renderer IPC, overlays, permission prompts, display/screenshot integration, and settings UI.

Local runtime facts must not unlock backend capabilities. In particular, coordinate methods are backend policy/provider outputs. The client can report or narrow local executable tools; it cannot grant OCR, vision, prediction, or paid backend capabilities.

## Public API

```ts
import { WindieClient, moduleTool } from "@windie/sdk";

const client = new WindieClient();

const agent = await client.wakeUp({
  backendUrl: "https://api.windieos.com",
  systemPrompt: "You are a concise coding agent.",
  workspacePath: "/Users/me/project",
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

Electron uses a sidecar-backed store adapter during the desktop migration:

- canonical SDK events are stored under the sidecar `conversation_event` record
  kind so they do not pollute visible `transcript` rows
- legacy transcript rows are projected into SDK events when a conversation has
  not yet been written through the canonical adapter
- compacted replay rows still use `transcript_replay`, but SDK loaders read them
  as replay snapshots before falling back to full event projection
- desktop compaction replacement-history writes go through the conversation store
  adapter's `replaceCompactedReplay(...)` path instead of stream handlers
  directly mutating replay storage
- compacted replay replacement appends a new generation with entry count and
  completion metadata; loaders keep using the previous complete generation if a
  newer write is partial
- desktop backend-session rehydrate uses the store adapter's SDK projection
  instead of shaping messages directly from visible transcript rows
- desktop recent-chat and open-chat loading use store metadata/display
  projections, with legacy transcript fallback for existing local chats
- desktop chat deletion goes through the Electron conversation store adapter and
  removes legacy transcript rows, compacted replay rows, and canonical
  `conversation_event` rows together
- startup metadata loading does not apply a hidden local chat limit; SDK callers
  pass an explicit `listMetadata({ limit })` option when they want a bounded page
- desktop edit/resend and try-again visible transcript rewrites are routed
  through the Electron conversation store adapter. During migration, the
  renderer still computes the replacement projection, but the adapter owns
  local transcript row deletion, replay-state clearing, workspace metadata, and
  rewritten row persistence.
- desktop `TranscriptWriter` visible transcript appends also route through the
  Electron conversation store adapter, so queued user/assistant/tool writes no
  longer own direct row IPC or replay append mutation.
- desktop manual compaction controls share one rehydrate-first runtime helper
  that uses the SDK store-backed conversation rehydrate path before sending
  `compact-history`.
- desktop and custom SDK hosts use the same backend settings route for
  model/provider updates. Public SDK callers should use `agent.setModel(...)`
  rather than shaping `update-settings` payloads by hand.

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
    "mode": "default_plus_client",
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

- `autoSidecar`: daemon script, discovery file, host/port, timeout, or Python command
  options for the default Node provider.
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
that known runtime. They do not auto-start a daemon just to inspect status.

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
`agent.stream(...)` and `agent.conversation(...).stream(...)` both run through
`SdkConversationRuntime`, which owns local tool execution when a sidecar/local
runtime adapter is available.

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

`listModels` is backend-owned. `listAgents` is SDK-runtime state for active local agent sessions.

`agent.setModel({ modelProvider, modelId, modelMode?, interactionMode? })` is
the first-class SDK model-changing API for agent-level selection. Conversation
runtimes also expose `conversation.setModel(...)`, and `conversation.send`,
`conversation.stream`, `conversation.editAndResend`, and `conversation.retryTurn`
accept `model` to switch immediately before the next turn. These APIs validate
the public camelCase selection and send the backend-owned `update-settings`
message with `model_provider`/`selected_model_id`. Desktop model dropdowns still
persist through renderer config, but the backend update route is owned by the
SDK main runtime. `updateSettings(config)` remains available for host
applications that own a broader settings surface.

`stream(input, options)` returns an `AsyncIterableIterator<WindieAgentStreamEvent>`.
It is a compatibility-shaped wrapper over `SdkConversationRuntime.stream()`: it
stores normalized events, preserves `conversationRef`/`turnRef`, routes local
tool calls through the SDK coordinator, and maps runtime events into `start`,
`text`, `tool_call`, `tool_output`, `complete`, `error`, or generic `event`
items for callers that use the older agent-stream shape.

`conversation(options)` returns an SDK conversation runtime backed by the agent
session transport. It is the migration path for clients that need local event
storage, display projections, rehydrate snapshots, stop handling, streaming,
and edit/retry revision operations.

`conversation.stream(input)` is the preferred custom-client loop API. It emits
normalized SDK runtime events, updates the configured conversation store, and
terminates when the projected runtime phase reaches `completed`, `stopped`, or
`error`. Pass `model` on the input when a custom UI wants a per-turn model
change without manually calling `agent.setModel(...)` first.

`agent.listConversations()` lists metadata from the agent's default conversation
store. `agent.loadConversation({ conversationRef })` opens a runtime over the
same store and returns its projected snapshot.

For a minimal non-Electron consumer, see `examples/cli-agent`. It uses
`WindieClient.wakeUp`, `agent.conversation`, `InMemoryConversationStore`, and
`conversation.stream()` against a mock websocket backend.

For a browser-based custom UI that renders SDK display projections directly,
see `examples/custom-ui`.

For the smallest local tool authoring path, see `examples/local-tool-extension`.
It uses `moduleTool(...)` to register a Python `module:function` entrypoint with
the sidecar daemon and lets the SDK return the tool result to the backend.
