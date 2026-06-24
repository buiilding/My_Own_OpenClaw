# Runtime Tracing

Use this skill when deciding how to add WindieOS runtime traces, especially for
long-running agent loops where evidence must be repeatable after restart.

## Trace Surface Decision

Choose the trace surface by ownership and lifetime:

- Use durable conversation `trace_event` rows when the path belongs to a
  specific conversation turn. This is the default for long-running agent loops.
- Use persistent app diagnostics when the path can happen before a
  conversation exists or outside a specific turn.
- Use gated live-surface traces only for transient renderer, window, overlay,
  and UI ordering questions while the app is running.

Live traces are not repeatable after restart unless terminal output was
captured. Persistent app diagnostics and durable conversation traces are
repeatable because they are stored in SQLite-backed diagnostics or conversation
history.

## Durable Conversation Traces

Add a durable `trace_event` for turn-scoped evidence such as SDK send,
resources, backend dispatch, provider calls, tool execution, local-runtime RPC,
artifact upload/fetch, memory retrieval/persistence, overlay phase,
supersession, title generation, websocket controls, workspace context, install
auth, or agent-definition shaping.

Primary owner files:

- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/conversation/types.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`

Inspect durable turn traces with:

```bash
./bin/windie.sh trace <conversation-ref> <turn-ref>
./bin/windie.sh trace <conversation-ref> <turn-ref> --path query.dispatch --json
./bin/windie.sh conversation traces <conversation-ref> --json
```

Durable trace payloads must stay sanitized. Persist ids, counts, booleans,
durations, enum states, and short error summaries. Do not persist user text,
assistant text, prompt text, provider payloads, tool arguments, tool output,
screenshots, file contents, local paths, tokens, credentials, embeddings, raw
SQL rows, or full stack traces.

## Persistent App Diagnostics

Add app diagnostics for pre-turn or non-turn paths such as startup, IPC bridge,
surface visibility, renderer interaction, display projection summaries, browser
session control, local-runtime lifecycle, permissions, MCP discovery,
enablement, registration, execution, and wakeword lifecycle.

Primary owner file:

- `frontend/src/main/diagnostics/app_diagnostics_store.cjs`

When adding a path:

1. Add a path constant.
2. Register owner and purpose in the diagnostic path definitions.
3. Add only allowlisted sanitized metadata keys.
4. Emit through `appendDiagnosticEvent(...)`.
5. Add focused tests for storage, filtering, and sanitization.
6. Update runtime trace docs and changelog.

Inspect app diagnostics with:

```bash
./bin/windie.sh diagnostics paths
./bin/windie.sh diagnostics list --path ipc.bridge --limit 100 --json
./bin/windie.sh diagnostics inspect <trace-id> --json
```

## Live Surface Traces

Use live-surface traces for renderer and native-window timing while debugging
the running app. Recent renderer trace work intentionally keeps these out of
DevTools and forwards them through the structured IPC trace client.

Primary owner files:

- `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`
- `frontend/src/main/debug/live_surface_trace_runtime.cjs`

Enable with:

```bash
WINDIE_DEBUG_LIVE_SURFACE=1 ./bin/windie.sh start desktop
```

or use the broader chat pill trace:

```bash
WINDIE_DEBUG_CHAT_PILL=1 ./bin/windie.sh start desktop
```

Live traces are diagnostics-only. They must not drive runtime behavior and
should not be the only evidence for a long-running loop invariant.

## Long-Running Agent Loop Evidence

For a long-running agent loop, collect persistent evidence first:

```bash
./bin/windie.sh diagnostics list --path ipc.bridge --limit 1000 --json
./bin/windie.sh diagnostics list --path surface.visibility --limit 1000 --json
./bin/windie.sh diagnostics list --path local_runtime.lifecycle --limit 1000 --json
./bin/windie.sh conversation list --limit 50 --json
./bin/windie.sh conversation traces <conversation-ref> --limit 1000 --json
```

Use live traces only as a companion when actively watching a UI race. If a
problem must be debugged after the run, add or use durable `trace_event` rows or
app diagnostics before relying on the loop.

## Repeatability Rule

A trace is repeatable only when it can be queried after the process exits:

- Repeatable: `trace_event` rows in conversation history.
- Repeatable: app diagnostics rows in the diagnostics database.
- Not repeatable by itself: `[LiveSurfaceTrace]` terminal output.
- Not repeatable by itself: stdout debug mirrors such as stream or chat-pill
  logs unless the run captures stdout.

When adding observability, prefer the producing runtime and smallest sanitized
signal that proves the boundary.
