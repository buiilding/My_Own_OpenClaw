---
summary: "Pre-flight plan for adding a durable path trace runtime, with memory retrieval as the first traced path and reusable substrate for future runtime traces."
read_when:
  - When adding durable diagnostics for memory retrieval, tool execution, screenshot capture, backend streaming, sidecar RPC, artifact upload, conversation rehydrate, or overlay phase behavior.
  - When deciding how a WindieOS runtime path should emit persistent, sanitized, turn-scoped trace events.
title: "Path Trace Runtime Plan"
---

# Path Trace Runtime Plan

Status: approved on 2026-06-10.

## User Intent

The user wants WindieOS to expose the status of every important runtime path in
a deterministic way. The immediate example is memory retrieval: after a turn,
the user should be able to inspect a durable timeline such as:

```text
memory.retrieval started
memory.embedding succeeded
memory.sidecar_search started
sidecar.rpc search_memory_by_embedding succeeded
memory.sidecar_search succeeded
memory.injection applied
memory.retrieval succeeded
```

These are not ephemeral console logs. They are persistent path trace events tied
to the conversation and turn. The implementation must be a precursor for future
trace paths, not a memory-specific diagnostic island.

## Architectural Change

Current behavior:

```text
SDK memory enrichment emits sparse memory_retrieval_diagnostic events only for
missing local runtime, embedding failure, sidecar search failure, or empty
search.

Sidecar memory search logs failures and selected debug details, but successful
retrieval has no durable per-stage trace.

Renderer transcript display hides memory diagnostics, and there is no general
path trace substrate for other runtime paths.
```

Target behavior:

```text
SDK creates a turn-scoped trace identity.
Runtime path owners emit structured TraceEvent rows.
Trace rows persist as hidden conversation events.
Normal transcript rendering ignores trace rows.
Diagnostics surfaces and CLI commands read trace rows by conversation, turn,
trace id, path, and runtime.
Memory retrieval becomes the first traced path.
Future paths reuse the same TraceEvent contract and recorder.
```

## Source Of Truth Changes

- SDK conversation runtime owns trace identity for turn-scoped work.
- SDK path trace recorder owns the canonical TraceEvent shape, redaction rules,
  span timing, and sink API.
- Sidecar owns sidecar-local span details for RPC handlers, SQLite work, FAISS
  search, and local tool execution.
- Backend owns backend-local span details for websocket receive, prompt
  construction, provider calls, remote tools, and result ingestion.
- Electron main owns transport and native-desktop spans such as IPC, sidecar
  bridge, screenshot orchestration, artifact materialization, and window
  lifecycle.
- Renderer owns display/projection spans only. Renderer does not invent producer
  truth for SDK, backend, Electron main, or sidecar work.
- Console logs become live mirrors only. Persistent trace events become the
  source of truth for path diagnostics.

## Runtime Boundaries

| Runtime | Trace responsibility |
| --- | --- |
| SDK | Create `traceId`, `spanId`, turn-scoped parent spans, path recorder, hidden conversation events, and public trace read APIs. |
| Electron main | Forward SDK trace events, attach trace context to sidecar RPC calls and native operations, emit native span metadata. |
| Sidecar | Accept trace context in JSON-RPC params, emit sanitized RPC/search/tool spans, return span metadata where direct event streaming is unavailable. |
| Backend | Accept trace context in websocket/query/tool-result payloads, emit sanitized backend spans, return backend trace metadata through existing event streams. |
| Renderer | Query and render trace timelines. Hide trace rows from the normal transcript. |
| CLI | Export persisted trace timelines without requiring renderer health. |

## Trace Event Contract

The shared contract is JSON-only and import-independent across runtimes.

```ts
type TraceEvent = {
  schemaVersion: 1;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  path: string;
  stage: string;
  status: 'started' | 'succeeded' | 'failed' | 'skipped';
  runtime: 'sdk' | 'electron-main' | 'renderer' | 'sidecar' | 'backend';
  conversationRef?: string | null;
  turnRef?: string | null;
  requestId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  } | null;
};
```

Required invariants:

- Every trace event has `schemaVersion`, `traceId`, `spanId`, `path`, `stage`,
  `status`, and `runtime`.
- `traceId` is stable across all spans for one turn execution.
- `spanId` is unique within a trace.
- `parentSpanId` links nested spans.
- Trace events are persisted as hidden conversation events.
- Trace events are ordered by event sequence first, then timestamp.
- Trace events never become normal chat transcript messages.

## Persistent Data Rules

Persist:

- trace identity fields
- conversation and turn identity
- path, stage, status, runtime
- timestamps and duration
- safe counts, limits, mode names, booleans, sanitized ids, and sanitized error
  summaries

Do not persist:

- user message text
- retrieved memory text
- embedding vectors
- screenshots
- file contents
- shell output
- raw provider payloads
- bearer tokens, API keys, install tokens, OAuth state, credentials
- raw SQL rows
- full stack traces in normal trace rows

Verbose internals may be printed under explicit debug flags, but durable trace
rows remain sanitized.

## First Path: Memory Retrieval

Memory retrieval becomes the proving path for the trace substrate.

Target trace:

```text
memory.retrieval started
memory.embedding requested
memory.embedding succeeded
memory.sidecar_search started
sidecar.rpc search_memory_by_embedding started
sidecar.memory_search searched
sidecar.rpc search_memory_by_embedding succeeded
memory.sidecar_search succeeded
memory.injection applied
memory.retrieval succeeded
```

Failure examples:

```text
memory.embedding failed
memory.injection skipped
memory.retrieval failed
```

```text
memory.sidecar_search skipped
memory.injection applied
memory.retrieval succeeded
```

Memory retrieval trace data must include only:

- `memoryRetrievalEnabled`
- `queryLength`
- `embeddingSpaceVersion`
- `combinedLimit`
- `episodicLimit`
- `semanticLimit`
- `semanticMinScore`
- `excludeConversationId`
- `searchedMemoryTypes`
- `episodicCandidateCount`
- `semanticCandidateCount`
- `episodicResultCount`
- `semanticResultCount`
- `topScore`
- `filteredByConversationCount`
- `filteredByScoreCount`
- `durationMs`
- sanitized failure code and message

## Reusable Future Paths

The substrate must support these future paths without new diagnostic systems:

- `tool.execution`
- `sidecar.rpc`
- `screenshot.capture`
- `artifact.upload`
- `conversation.rehydrate`
- `backend.stream`
- `backend.prompt`
- `provider.call`
- `overlay.phase`
- `permission.probe`
- `browser.runtime`

Each future path must add path-specific span producers and tests while reusing:

- TraceEvent contract
- trace recorder
- redaction rules
- hidden conversation persistence
- diagnostics timeline reader
- CLI export path

## Out Of Scope

- Changing memory retrieval ranking.
- Changing embedding provider selection.
- Changing memory DB schema.
- Persisting raw memory contents in trace rows.
- Persisting embedding vectors.
- Rendering trace events in the normal chat transcript.
- Building a broad observability dashboard before the trace substrate exists.
- Adding a second logging system for memory retrieval.
- Replacing existing backend, Electron, sidecar, or renderer logs.

## Ordered Plan

1. Inspect current SDK conversation event types, conversation store persistence,
   hidden event handling, replay behavior, and current `memory_retrieval_diagnostic`
   projection rules.
2. Inspect current Electron main local-runtime RPC forwarding and sidecar daemon
   event subscription paths to identify where trace context already crosses
   process boundaries.
3. Define the shared TraceEvent contract in SDK types and add a Python mirror
   helper for sidecar validation/serialization.
4. Add an SDK TraceRecorder that creates trace ids, span ids, timing fields,
   sanitized error payloads, and hidden conversation trace events.
5. Add trace context propagation to SDK turn execution, backend query payloads,
   and local runtime RPC params.
6. Persist trace events as hidden conversation events and verify replay,
   metadata listing, and transcript display ignore them.
7. Implement memory retrieval trace spans in the SDK enrichment path:
   retrieval start, embedding request/result, sidecar search request/result,
   injection applied/skipped, and retrieval completion.
8. Extend sidecar `search_memory_by_embedding` to accept trace context and
   return sanitized search trace metadata: searched targets, index totals,
   candidate counts, filter counts, result counts, score summary, and duration.
9. Merge sidecar search metadata into SDK trace events without persisting
   memory text, embeddings, raw rows, or raw SQL details.
10. Replace the sparse memory retrieval diagnostic success/failure path with
    the durable trace rows while preserving any existing public diagnostic view
    through a compatibility projection over trace events.
11. Add a renderer diagnostics timeline reader that queries persisted trace
    events by conversation and turn. Keep normal transcript rendering unchanged.
12. Add `bin/windie trace <conversation-ref> <turn-ref>` to export the same
    persisted timeline for CLI debugging.
13. Update docs for the trace contract, path trace workflow, memory retrieval
    diagnostics, diagnostic flags, and evidence packet guidance.
14. Create the matching implementation report and keep it updated through each
    approved implementation slice.

## Implementation Slices After Approval

### Slice 1: Trace Contract And Recorder

- Add shared SDK TraceEvent types.
- Add sidecar Python normalization helper.
- Add SDK TraceRecorder with redaction and timing tests.
- Add hidden conversation event type for trace rows.

### Slice 2: Persistence And Replay Boundary

- Store trace rows in the conversation event ledger.
- Ensure replay can load trace rows for diagnostics.
- Ensure display projection excludes trace rows.
- Add tests that normal transcript messages do not include trace rows.

### Slice 3: Memory Retrieval Trace

- Instrument SDK memory retrieval stages.
- Add trace context to `search_memory_by_embedding`.
- Add sidecar sanitized search metadata.
- Merge sidecar metadata into trace events.

### Slice 4: Diagnostics Reader

- Add renderer trace timeline reader.
- Add CLI trace export.
- Add docs and evidence packet updates.

## Validation Commands

Run during implementation:

```bash
bin/windie docs list
bin/windie test frontend -- WindieSdkContextEnrichment.test.ts WindieSdkConversationRuntime.test.ts
bin/windie test frontend -- ConversationReplayDatabaseIntegration.test.tsx
bin/windie test sidecar tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py -q
bin/windie test frontend -- LocalBackendBridge.rpc.test.cjs
git diff --check
```

Add narrower new tests as files are introduced. Run broader frontend, sidecar,
and backend suites only if the implementation touches shared event contracts,
sidecar RPC mapping, backend query payloads, or renderer replay infrastructure.

## Success Criteria

- Every traced turn has a stable `traceId`.
- Memory retrieval emits durable trace rows for success, skip, empty result, and
  failure paths.
- Trace rows persist across app restart and replay.
- Trace rows are hidden from normal transcript display.
- Trace rows contain no user message text, memory text, embeddings, screenshots,
  file contents, secrets, raw provider payloads, or raw SQL rows.
- Sidecar memory search reports sanitized count/timing metadata for traced
  searches.
- Diagnostics UI and CLI can read the same persisted trace timeline.
- Future path traces can add new `path` values without creating new stores,
  bridge vocabularies, or renderer-only diagnostics.
- Existing memory retrieval behavior, prompt injection behavior, and active
  conversation exclusion semantics do not regress.

## Reread Anchors After Compaction

Before implementation resumes after context compaction, reread:

- this plan
- matching report file once created
- `pending/compaction_safe_plan_execution.md`
- `docs/debug/observability_change_workflow.md`
- `docs/debug/runtime_traces.md`
- `docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md`
- `docs/sdk/conversation_runtime.md`
- `docs/frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`
- `packages/windie-sdk-js/src/runtime/AgentStreamEvents.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`

## Approval Gate

Implementation must not begin until the user approves this plan. If the user
changes the desired trace contract, persistence rule, first traced path, or
runtime ownership boundary, update this plan first and wait for approval again.
