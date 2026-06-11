---
summary: "Pre-flight plan for adding durable screenshot.capture path traces to the query screenshot capture path."
read_when:
  - When adding persistent diagnostics for query screenshot capture, screenshot resource resolution, Electron screenshot surface preparation, sidecar screenshot capture, or screenshot artifact upload outcomes.
  - When debugging missing, stale, inline, artifact-backed, monitor-shifted, or overlay-contaminated query screenshots after app restart.
title: "Screenshot Capture Path Trace Plan"
---

# Screenshot Capture Path Trace Plan

Status: approved on 2026-06-11.

## User Intent

Add the next durable path trace after `memory.retrieval`, using the same trace
substrate:

- hidden `trace_event` conversation rows
- SDK `TraceRecorder`
- `buildTraceTimeline()`
- renderer `loadTraceTimeline(...)`
- `bin/windie trace`
- sidecar `path_trace.py` helpers when sidecar owns part of the work

The chosen path is `screenshot.capture`, narrowed to query screenshot capture
during a user turn. The trace should explain what happened after restart when a
query screenshot is missing, stale, inline instead of artifact-backed, attached
to the wrong turn, taken from the wrong monitor, or includes WindieOS overlay
surfaces.

## Current Runtime Path

The inspected live path is:

1. Renderer builds a typed `query_screenshot_request` resource when the overlay
   sender policy asks for query screenshot capture and no clipboard image
   already supplies screenshot context.
2. SDK `ConversationRuntime.send()` creates the turn, persists the base user row,
   and resolves turn resources after the turn exists.
3. SDK default turn resource resolver executes the local `screenshot` tool,
   passing `conversationRef` and `turnRef` through the local tool call.
4. SDK local tool lifecycle calls Electron main before execution.
5. Electron main owns screenshot surface preparation:
   - Linux hides/restores visible overlay windows.
   - macOS and Windows apply/remove content protection.
6. Electron main bridge resolves display bounds and dispatches the sidecar
   screenshot tool.
7. Python sidecar screenshot tool owns actual capture, cursor overlay,
   coordinate-frame normalization, and `capture_meta`.
8. Electron main may materialize sidecar `screenshot_path` results into
   `screenshot_ref`/`screenshot_url` or inline base64 fallback for the legacy IPC
   capture channel.
9. SDK resolver accepts existing screenshot refs, sidecar paths, or inline
   screenshot bytes; uploads when needed; patches user metadata; and sends a
   backend-compatible query payload.

Renderer can read the final diagnostics, but it must not invent SDK, Electron
main, sidecar, or backend truth.

## Why This Path Is Next

`screenshot.capture` crosses the most failure-prone local runtime boundaries in
one user-visible workflow:

- SDK turn/resource lifecycle
- Electron main surface/window policy
- sidecar local machine capture
- artifact upload and fallback behavior
- backend query payload shape

Existing tests prove much of the behavior, and live debug logs can help during
one session. The missing piece is a durable, sanitized timeline tied to the
conversation and turn so the failure can be reconstructed after restart.

## Source Of Truth Changes

- SDK remains the turn-scoped trace identity owner. It records durable
  `trace_event` rows using `TraceRecorder`.
- SDK resource resolution owns query screenshot request, resolver start/end,
  optional failure semantics, upload outcome observed by the SDK, and backend
  payload application.
- Electron main owns surface-preparation facts and display-bounds injection
  facts. It should expose sanitized metadata to the SDK-owned trace, not through
  renderer reconstruction.
- Python sidecar owns screenshot capture facts: capture engine, dimensions,
  crop/virtual bounds, monitor id, byte size, and sidecar duration.
- Backend artifact storage remains a separate owner. This plan records only the
  SDK-observed artifact upload outcome for query screenshot capture. A deeper
  backend-owned `artifact.upload` trace is explicitly out of scope.
- Renderer owns diagnostics reading and display only.

No new trace table, renderer-only diagnostics store, or parallel screenshot log
system should be added.

## Trace Timeline

Use one path name: `screenshot.capture`.

Expected successful artifact-backed query screenshot timeline:

```text
screenshot.capture resource_detected succeeded runtime=sdk
screenshot.capture resolver started runtime=sdk
screenshot.capture surface_prepare started runtime=electron-main
screenshot.capture surface_prepare succeeded runtime=electron-main
screenshot.capture sidecar_capture started runtime=sidecar
screenshot.capture sidecar_capture succeeded runtime=sidecar
screenshot.capture artifact_upload started runtime=sdk
screenshot.capture artifact_upload succeeded runtime=sdk
screenshot.capture resolver succeeded runtime=sdk
screenshot.capture query_payload_applied succeeded runtime=sdk
```

Expected no-capture or fallback examples:

```text
screenshot.capture resource_detected skipped runtime=sdk reason=clipboard_image_present
```

```text
screenshot.capture sidecar_capture failed runtime=sidecar
screenshot.capture resolver skipped runtime=sdk optional_failure=true
screenshot.capture query_payload_applied succeeded runtime=sdk hasScreenshotRef=false
```

```text
screenshot.capture artifact_upload failed runtime=sdk
screenshot.capture resolver succeeded runtime=sdk uploadMode=inline_fallback
```

## Persisted Metadata Rules

Allowed trace data:

- ids: `conversationRef`, `turnRef`, `traceId`, `spanId`, sanitized artifact id
- counts: resource count, screenshot ref count, visible capture window count
- modes: platform, lease mode, capture engine, upload mode, content type
- booleans: required, first user message, local runtime available, uploader
  available, has display bounds, has screenshot ref, has capture meta
- limits and dimensions: source width/height, crop x/y/width/height, virtual
  desktop x/y/width/height, byte count
- durations
- short sanitized error codes and messages

Never persist:

- screenshot bytes, base64, image data, or screenshots
- local screenshot paths or filesystem paths
- user text, attachment text, file contents, or shell output
- raw provider payloads, raw backend responses, or full request/response bodies
- tokens, credentials, auth headers, API keys, install tokens, OAuth state
- raw sidecar args if they include text or content-bearing values
- raw SQL rows or stack traces

Error summaries must use the existing trace redaction behavior and should stay
short enough to explain the branch without storing stack traces.

## Implementation Workflow

1. Reread the trace substrate:
   - `packages/windie-sdk-js/src/runtime/TraceRecorder.ts`
   - `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
   - `packages/windie-sdk-js/src/projections/conversationProjections.ts`
   - `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
   - `frontend/src/main/python/path_trace.py`
   - `scripts/windie/commands.cjs`
2. Reread the query screenshot path:
   - `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
   - `packages/windie-sdk-js/src/runtime/TurnInputPipeline.ts`
   - `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
   - `frontend/src/main/sdk/tool_surface_lifecycle.cjs`
   - `frontend/src/main/surfaces/surface_runtime.cjs`
   - `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`
   - `frontend/src/main/sidecar/local_backend_bridge_tool_args.cjs`
   - `frontend/src/main/sidecar/local_backend_bridge_screenshot_attachment.cjs`
   - `frontend/src/main/python/local_backend.py`
   - `frontend/src/main/python/sidecar_daemon.py`
   - `frontend/src/main/python/tools/registry.py`
   - `frontend/src/main/python/tools/computer/screenshot_tool.py`
3. Extend the SDK turn resource resolution context with trace context and an
   SDK-owned trace emit callback.
4. Instrument only `query_screenshot_request` in the default SDK resolver.
5. Preserve existing optional failure behavior: query screenshot capture failure
   should not abort send unless the resource is explicitly required.
6. Pass sanitized trace context through local screenshot tool calls without
   making renderer the producer of truth.
7. Add Electron main surface-preparation metadata for the screenshot lifecycle
   branch:
   - platform
   - lease mode
   - visible capture window count
   - settle duration
   - success/failure status
8. Add sidecar screenshot trace helper functions in `path_trace.py` and return
   sanitized sidecar capture trace metadata from the screenshot tool path.
9. Have SDK merge sidecar/main/upload metadata into durable `trace_event` rows.
10. Update docs for `screenshot.capture` as the second durable traced path.
11. Add focused tests and run validation.
12. Create and maintain the matching implementation report only after this plan
    is approved and coding begins.

## Success Criteria

- Query screenshot capture emits durable hidden `trace_event` rows under
  `screenshot.capture`.
- The trace can be loaded after restart through the same SDK projection,
  renderer continuity loader, and `bin/windie trace` path filter used for
  `memory.retrieval`.
- The timeline identifies which runtime produced each stage:
  SDK, Electron main, or sidecar.
- Trace rows explain success, optional failure, artifact upload, inline fallback,
  and skipped capture branches without persisting screenshot content or user
  content.
- Normal transcript rendering and backend rehydrate history continue to hide
  trace rows.
- Existing query screenshot behavior, display bounds, capture metadata, upload
  fallback, and optional failure semantics do not regress.

## Tests To Add Or Update

- SDK conversation runtime test:
  - successful `query_screenshot_request` persists ordered
    `screenshot.capture` trace rows.
  - trace rows are hidden from display projection.
  - `buildTraceTimeline(..., { path: "screenshot.capture" })` returns the
    expected sanitized timeline.
- SDK resolver failure test:
  - optional screenshot failure records failed/skipped trace spans and send
    continues without `screenshot_ref`.
- SDK sanitizer test:
  - trace rows do not include screenshot bytes, local paths, auth headers, user
    text, raw args, or stack traces.
- Electron main/surface lifecycle test:
  - Linux records hide/restore-style metadata.
  - macOS/Windows record content-protection-style metadata.
- Sidecar screenshot test:
  - sidecar trace helper returns only capture engine, dimensions, crop/virtual
    bounds, monitor id, byte count, and duration.
- CLI/continuity projection test:
  - persisted `trace_event` rows for `screenshot.capture` can be read through
    the same timeline path used by `memory.retrieval`.

## Validation Commands

Focused validation expected after implementation:

```bash
bin/windie test frontend -- WindieSdkConversationRuntime.test.ts DesktopConversationContinuityService.test.ts SurfaceRuntime.test.cjs LocalBackendBridge.rpc.test.cjs
bin/windie test sidecar tests/sidecar/test_screenshot_tool.py -q
./scripts/python-in-env sidecar python -m py_compile frontend/src/main/python/path_trace.py frontend/src/main/python/tools/computer/screenshot_tool.py
bin/windie docs list
git diff --check
```

If implementation touches only a subset of these paths, the report must explain
which validation commands were run, skipped, or replaced by narrower focused
tests.

## Non-Goals

- Do not add tracing for all tool execution in this phase.
- Do not add a general `sidecar.rpc` trace path in this phase.
- Do not add backend-owned artifact-store spans in this phase.
- Do not trace post-action screenshots for mouse, keyboard, wait, shell, or
  bundles in this phase.
- Do not move screenshot capture back into renderer.
- Do not persist screenshot content, local paths, raw args, credentials, or user
  text in trace rows.
- Do not create a new diagnostics table or renderer-only trace store.

## Reread Anchors After Compaction

- This plan.
- `docs/plans/2026-06-10-path-trace-runtime-plan.md`
- `docs/debug/runtime_traces.md`
- `docs/frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md`
- `docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md`
- `docs/frontend/main/local_backend/screenshot_display_bounds_fallback_and_attachment_materialization_reference.md`
- `docs/plans/2026-06-08-sidecar-logical-screenshot-coordinate-plan.md`

## Approval Gate

Stop after creating this plan. Do not implement, create the matching report, or
commit until the user approves this plan or requests changes.
