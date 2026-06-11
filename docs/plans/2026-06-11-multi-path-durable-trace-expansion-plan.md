---
title: Multi-Path Durable Trace Expansion Plan
date: 2026-06-11
status: completed
---

# Multi-Path Durable Trace Expansion Plan

## Goal

Add durable `trace_event` diagnostics for at least 15 high-value WindieOS
runtime paths, using the existing path trace substrate:

- hidden SDK conversation `trace_event` rows
- SDK `TraceRecorder`
- `buildTraceTimeline()`
- renderer `DesktopConversationContinuityService.loadTraceTimeline(...)`
- `bin/windie trace`
- Python sidecar `path_trace.py` helpers where the sidecar owns work

The result should let a developer answer "what happened for this conversation
turn after restart?" without relying on live console logs or renderer-invented
state.

Existing durable traced paths are out of scope for the count:

- `memory.retrieval`
- `screenshot.capture`

## Boundaries

### In scope

- Add at least 15 new durable trace paths.
- Emit trace rows at the runtime that owns the fact.
- Keep trace rows hidden from normal transcript display and backend rehydrate
  history.
- Keep the existing CLI/renderer timeline readers as the single read path.
- Add focused tests for producer metadata, persistence, projection filtering,
  and CLI/path filtering.
- Update runtime trace docs, changelog, and a matching implementation report.

### Non-goals

- Do not add a second trace table, renderer-only diagnostics store, or broad
  logging framework.
- Do not persist raw prompts, user messages, memory text, embeddings,
  screenshots, file contents, shell output, browser page text, provider payloads,
  tokens, credentials, raw SQL rows, or stack traces.
- Do not trace every stream chunk or token as a durable row.
- Do not make renderer diagnostics the source of truth for backend, SDK,
  Electron main, sidecar, or provider behavior.
- Do not change tool, provider, prompt, or overlay behavior except to emit
  sanitized diagnostic rows.

## Current Trace Contract

The existing durable trace contract stores hidden SDK conversation events with:

- `traceId`, `spanId`, and `parentSpanId`
- `conversationRef` and `turnRef`
- `path`, `stage`, `status`, and `runtime`
- timestamps and `durationMs`
- sanitized ids, counts, booleans, modes, limits, and short error summaries

`memory.retrieval` and `screenshot.capture` already prove the pattern:

- SDK creates/persists trace rows with `TraceRecorder`.
- Sidecar-owned work returns sanitized trace metadata through `path_trace.py`
  helpers.
- Display and rehydrate projections hide trace rows.
- Renderer and CLI readers load the same persisted timeline.

## Required Design Decision

The current substrate is SDK-persisted, while several target paths are
backend-owned. To avoid renderer-invented truth, backend-owned spans need an
explicit producer-owned handoff into the SDK trace ledger.

Planned contract:

1. Backend producers emit sanitized trace payloads as diagnostic stream events
   or metadata on existing stream events.
2. SDK transport normalization recognizes only the trace diagnostic envelope,
   validates shape and sanitizes again, then appends hidden `trace_event` rows
   with `source: "backend"` and `runtime: "backend"` or `runtime: "provider"`.
3. Sidecar-owned work returns sanitized `path_trace` metadata through RPC/tool
   responses; SDK/Electron main merge that into the active `TraceRecorder`.
4. Electron main-owned work returns sanitized lifecycle metadata to SDK-owned
   callers; the renderer only reads persisted rows.

This keeps one durable storage/read model while preserving producer boundaries.

## Trace Paths

At least these 15 new paths should be implemented. Paths can be split only when
the producing runtime and diagnostic question are genuinely different.

| # | Path | Primary owners | Why durable trace helps | Safe metadata |
| --- | --- | --- | --- | --- |
| 1 | `tool.execution` | backend, SDK, Electron main, sidecar | Proves whether a model-visible tool was emitted, claimed, executed, delivered back, and committed to history. | tool name, request id, bundle id, tool call id, step count, lane, timeout ms, success, duration, delivery failed boolean, short error summary |
| 2 | `sidecar.rpc` | Electron main, sidecar | Proves JSON-RPC request/response lifecycle after restart without sidecar stdout logs. | method, request id, timeout ms, runtime pid presence, success, duration, response shape keys/counts, short error summary |
| 3 | `backend.stream` | backend API, SDK transport | Proves backend stream milestones reached SDK without persisting chunks. | event type counts, first event type, terminal event type, terminal status, dropped/malformed count, duration |
| 4 | `backend.prompt` | backend prompt/context runtime | Proves prompt assembly, tool schema inclusion, and context budget decisions without prompt text. | model id, provider name, message count, tool schema count, prompt token estimate, context limit, cache used boolean, duration |
| 5 | `provider.call` | backend LLM/provider runtime | Proves provider request start, first visible event, retry, completion, token counts, and error class. | provider, model id, streaming mode, attempt, retry count, first token ms, total duration, token counts, cache hit/status, short error summary |
| 6 | `conversation.rehydrate` | SDK store/projection, backend rehydrate service | Proves replay snapshot loading, provider-safe conversion, backend normalization, and history replacement. | conversation ref, revision id, message count, compacted replay boolean, hydrated boolean, normalized entry count, repaired linkage count, duration |
| 7 | `artifact.upload` | Electron main/upload bridge, backend artifact API, SDK | Proves local screenshot/file artifact materialization and backend storage result. | artifact id, content type, byte count, source kind, upload duration, retry count, success, short error summary |
| 8 | `query.resources` | SDK turn input pipeline, SDK resource resolvers, sidecar/Electron helpers when invoked | Proves query resource handles were resolved into backend-safe payload metadata before dispatch. | resource count, resource kinds, resolver count, payload key count, metadata key count, duration, short error summary |
| 9 | `memory.persistence` | SDK completed-turn memory writer, sidecar memory RPC | Proves completed turns attempted durable memory storage and whether cache invalidation should occur. | enabled boolean, local runtime presence, SDK client presence, user/assistant text lengths, memory type names, memory id presence, duration, short error summary |
| 10 | `title.generation` | SDK completed-turn title workflow, backend title generator, sidecar title state RPC | Proves first-turn title generation and sidecar title-state/update boundaries without storing title text. | model/provider presence, user/assistant text lengths, generated title length, success boolean, duration, short error summary |
| 11 | `backend.compaction` | backend compaction engine and interaction loop | Proves backend history compaction decision/application details without storing compaction summaries or replacement history. | reason, strategy, token counts, removed message count, applied boolean, skipped reason, summary presence boolean, duration, short error summary |
| 12 | `query.dispatch` | renderer intent boundary, SDK conversation runtime, backend websocket | Proves a UI goal became one backend-safe query payload and active turn. | conversation ref, turn ref, resource counts, attachment count, screenshot ref count, model selection id, local runtime available boolean, duration |
| 13 | `settings.sync` | SDK settings contract, Electron main, backend settings handlers | Proves model/settings changes are sent, acknowledged, and scoped correctly. | setting keys changed, provider/model ids, ack boolean, conversation scoped boolean, session scoped boolean, duration, short error summary |
| 14 | `compaction.lifecycle` | SDK runtime/store, backend compaction/history | Proves compaction decision, started/completed/failed events, replay replacement, and post-rehydrate state. | trigger, before/after message counts, token counts, compacted entry count, generation id, active boolean, duration, short error summary |
| 15 | `model.catalog` | backend model service, SDK/main settings runtime | Proves model list/provider availability path and filtering. | provider count, model count, credential availability booleans, local provider available boolean, cache hit boolean, duration, short error summary |

## Live Producer Source Map

This map is the starting point for implementation. Re-check these files before
editing because this repo is actively changing.

| Path | Producer boundaries to inspect first | Focused tests to extend first |
| --- | --- | --- |
| `tool.execution` | `backend/src/agent/execution/interaction_loop.py`, `backend/src/tools/single_tool_execution.py`, `backend/src/tools/bundle_execution.py`, `backend/src/api/handlers/tool_result.py`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`, `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/tools/registry.py` | `tests/frontend/WindieSdkConversationRuntime.test.ts`, `tests/frontend/LocalBackendBridge.rpc.test.cjs`, `tests/backend/test_tool_result_handler.py`, `tests/sidecar/test_local_backend.py` |
| `sidecar.rpc` | `packages/windie-sdk-js/src/runtime/LocalSidecarRuntime.ts`, `frontend/src/main/sidecar/local_backend_bridge.cjs`, `frontend/src/main/python/core/ipc_protocol.py`, `frontend/src/main/python/local_backend.py` | `tests/frontend/LocalBackendBridge.rpc.test.cjs`, `tests/sidecar/test_local_backend.py` |
| `backend.stream` | `backend/src/api/services/query_execution.py`, `backend/src/api/processing/pipeline.py`, `backend/src/api/processing/formatter.py`, `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`, SDK conversation runtime event ingestion | backend query/formatter tests plus `tests/frontend/WindieSdkConversationRuntime.test.ts` |
| `backend.prompt` | `backend/src/agent/llm/conversation_context.py`, prompt builder modules, `backend/src/agent/execution/interaction_loop.py` | backend prompt/context tests and event-presenter tests |
| `provider.call` | `backend/src/agent/llm/llm_stream_processor.py`, provider modules under `backend/src/llm/providers`, token-counting helpers | `tests/backend/test_llm_stream_processor.py` and provider-specific stream tests |
| `conversation.rehydrate` | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`, SDK stores, `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_execution.py` | `tests/frontend/WindieSdkConversationRuntime.test.ts`, store tests, backend rehydrate tests |
| `artifact.upload` | `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `frontend/src/main/sidecar/local_backend_bridge_screenshot_attachment.cjs`, `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`, `backend/src/api/routes/artifacts`, `backend/src/services/artifacts/store.py` | `tests/frontend/LocalBackendBridge.rpc.test.cjs`, `tests/frontend/ChatMessageSender.test.tsx`, `tests/backend/test_artifacts_store.py` |
| `query.resources` | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/TurnInputPipeline.ts`, `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts` | `tests/frontend/WindieSdkConversationRuntime.test.ts` |
| `memory.persistence` | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`, sidecar memory RPC implementation | `tests/frontend/WindieSdkConversationRuntime.test.ts`, sidecar memory RPC tests |
| `title.generation` | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, backend title generator client path, sidecar title-state RPC implementation | `tests/frontend/WindieSdkConversationRuntime.test.ts`, sidecar title RPC tests |
| `backend.compaction` | `backend/src/agent/execution/interaction_loop.py`, backend compaction engine/history modules, backend compaction event formatters | `tests/backend/test_interaction_loop_compaction.py`, SDK compaction event normalization tests |
| `query.dispatch` | `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`, `frontend/src/main/ipc.cjs`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/transport/WindieAgentSession.ts`, backend query handler | message sender tests, IPC query send tests, SDK runtime tests |
| `settings.sync` | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/transport/WindieAgentSession.ts`, backend settings handlers, Electron main settings/runtime IPC | settings sync and frontend/backend websocket contract tests |
| `compaction.lifecycle` | SDK compaction event normalization, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, SDK stores, backend compaction event formatters and history compaction engine | SDK compaction tests, chat stream compaction handler tests, backend formatter/compaction tests |
| `model.catalog` | `packages/windie-sdk-js/src/runtime/WindieClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, SDK transport list-models path, backend model/settings services | model/list settings tests and frontend/backend websocket contract tests |

Deferred candidates after the required 15:

- `artifact.fetch`
- `overlay.phase`
- `permission.probe`
- `browser.runtime`
- `tool.schema.policy`
- `websocket.control`
- `voice.transcription`
- `tts.playback`
- `extension.load`
- `mcp.tool`
- `workspace.context`
- `install.auth`
- `run.control`
- `browser.extension.attach`

## Implementation Phases

### Phase 1: Trace Ingress Contract

- Add a small shared validator for backend/sidecar trace envelopes consumed by
  SDK persistence.
- Keep `TraceRecorder` as the writer for SDK-owned rows.
- Add backend-origin trace ingestion through SDK transport normalization.
- Add sidecar trace helper functions only for sidecar-owned metadata shaping.
- Add tests proving backend/sidecar trace data is sanitized and stored as
  hidden `trace_event` rows.
- Add one narrow integration fixture that proves a backend-origin trace envelope
  becomes a persisted `trace_event` row without adding display or rehydrate
  output.
- Decide whether backend-origin traces are emitted as a new diagnostic stream
  event or as a typed diagnostic payload attached to existing terminal events.
  Prefer a new diagnostic envelope if attaching to existing user-visible event
  families would blur producer ownership.

### Phase 2: Core Query and Backend Paths

Implement:

- `query.dispatch`
- `query.resources`
- `backend.stream`
- `backend.prompt`
- `provider.call`
- `conversation.rehydrate`
- `compaction.lifecycle`
- `backend.compaction`

These paths cover the main turn lifecycle and backend-owned prompt/provider
behavior before expanding into tools and surfaces.

Recommended order:

1. `query.dispatch`, because it creates the turn-local trace context that later
   spans join.
2. `backend.stream`, because backend-origin trace ingress must prove stream
   diagnostics survive SDK normalization.
3. `backend.prompt` and `provider.call`, because they are backend-owned and
   should not be approximated from SDK/renderer observations.
4. `query.resources`, because resource handles must be resolved before backend
   dispatch and should expose counts/kinds without file contents.
5. `conversation.rehydrate`, `compaction.lifecycle`, and `backend.compaction`,
   because they prove the trace system stays hidden during replay and history
   replacement workflows.

### Phase 3: Tool, Sidecar, Browser, and Artifact Paths

Implement:

- `tool.execution`
- `sidecar.rpc`
- `artifact.upload`
- `memory.persistence`
- `title.generation`

These paths cross SDK/Electron main/sidecar/backend boundaries and need the
most careful metadata sanitization.

Recommended order:

1. `tool.execution`, because it supplies request/bundle ids and should be the
   parent trace for sidecar RPC, browser, and tool-result artifact work.
2. `sidecar.rpc`, because JSON-RPC diagnostics should be reusable by tool,
   memory, permission, and browser sidecar paths without logging stdout.
3. `artifact.upload`, because trace rows should persist artifact ids and byte
   counts, not binary payloads.
4. `memory.persistence` and `title.generation`, because completed-turn
   background work crosses SDK, backend, and sidecar boundaries while remaining
   tied to a conversation turn.

### Phase 4: Settings and Catalog Paths

Implement:

- `settings.sync`
- `model.catalog`

These paths improve restart-safe diagnostics for runtime configuration without
making renderer display state authoritative.

Recommended order:

1. `settings.sync` and `model.catalog`, because they prove model/runtime
   configuration without storing credentials or provider internals.

### Phase 5: Docs, CLI, and Completion Audit

- Update `docs/debug/runtime_traces.md` with every durable path.
- Add `bin/windie trace --paths` or equivalent discoverability if the CLI lacks
  path listing.
- Add focused docs for safe metadata and forbidden fields.
- Create/update the matching report with commits, validations, blockers, and
  deviations.
- Re-open the plan/report and compare them against the live tree before marking
  done.

## Testing Plan

Common tests for every path:

- Trace rows are hidden from display projection.
- Trace rows are omitted from backend rehydrate history.
- `buildTraceTimeline(..., { path })` returns the expected rows.
- Renderer `loadTraceTimeline(...)` reads persisted rows.
- `bin/windie trace <conversation-ref> <turn-ref> --path <path>` filters rows.
- Sanitization redacts forbidden keys and preserves safe ids/counts/durations.

Focused tests by layer:

- SDK: `TraceRecorder`, transport trace ingestion, conversation runtime,
  projections, and store persistence.
- Backend: trace envelope emission for prompt/provider/stream/rehydrate/tool
  result paths without prompt/provider payload leakage.
- Electron main: sidecar bridge, artifact upload/fetch, permission probe, and
  overlay phase lifecycle metadata.
- Sidecar: `path_trace.py` helpers for RPC, tool execution, browser runtime,
  and permission/capability probes.
- CLI: path filtering, JSON export, and no display of hidden rows as transcript.

Suggested validation commands:

```bash
bin/windie docs list
bin/windie test frontend -- WindieSdkConversationRuntime.test.ts DesktopConversationContinuityService.test.ts DesktopConversationStore.test.ts
bin/windie test frontend -- LocalBackendBridge.rpc.test.cjs SurfaceRuntime.test.cjs
bin/windie test backend -- tests/backend/test_llm_stream_processor.py tests/backend/test_tool_result_handler.py tests/backend/test_query_execution_service.py
./scripts/python-in-env sidecar pytest tests/sidecar/test_screenshot_tool.py tests/sidecar/test_local_backend.py -q
git diff --check
```

The exact test list should be narrowed or expanded as each path is implemented.

## Security and Privacy Rules

Persist only:

- ids and short opaque refs
- counts and limits
- enum modes and runtime names
- booleans
- durations
- dimensions and byte counts where the content itself is not persisted
- short error summaries

Never persist:

- user text
- prompt text
- memory text
- embeddings
- screenshots or base64 image data
- file contents
- shell output
- browser page text
- provider request/response payloads
- tokens, credentials, API keys, OAuth state, install auth secrets
- raw SQL rows
- stack traces

## Completion Criteria

- At least 15 new durable paths are implemented beyond `memory.retrieval` and
  `screenshot.capture`.
- Each path has producer-owned spans and sanitized metadata.
- Backend-owned behavior is emitted by backend producers, not invented in
  renderer or SDK consumers.
- Sidecar-owned behavior uses `path_trace.py` helpers or equivalent sanitized
  sidecar-owned metadata.
- Renderer and CLI consume the same persisted `trace_event` rows.
- Docs and changelog describe the new paths.
- A matching report records implementation slices, commits, validations,
  blockers, and deviations.

## Execution Gate

The user has asked Codex to keep going without pausing for a separate approval
message. Continue implementation from this plan and keep the matching report
updated through each coherent slice.
