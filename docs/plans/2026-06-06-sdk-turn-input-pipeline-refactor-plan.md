---
summary: "Pre-flight plan for making SDK turn input a first-class staged pipeline with resource handles, host resolvers, metadata events, and model-facing payload assembly."
read_when:
  - When changing chat send timing, query screenshots, readable-file attachments, SDK ConversationRuntime send lifecycle, or Electron main conversation.send handling.
  - When debugging delayed sent-message display, attachment enrichment timing, or ownership drift between renderer send preparation and SDK runtime state.
title: "SDK Turn Input Pipeline Refactor Plan"
---

# SDK Turn Input Pipeline Refactor Plan

Status: implemented.

## User Intent

The previous live-turn refactor made SDK display rows and SDK live-turn
presentation the source of truth. The remaining problem is deeper than a slow
hook: the system still lacks a first-class model for "what the user sent" versus
"what the host resolves before backend transport."

The current renderer still performs desktop-specific resource work before the
SDK turn exists. A narrow post-start host hook would improve timing, but it
would not be foundational enough because it would keep "query enrichment" as a
bag of desktop payload fields rather than a typed SDK lifecycle.

The foundational target is:

```text
renderer submits a TurnInput:
  text
  conversationRef / turnRef
  resource handles selected by the user
  send policy hints

SDK starts a TurnExecution:
  records turn_started
  records base user_message
  exposes typingVisible=true

SDK resolves input resources through registered host capabilities:
  readable file handles -> attachment context or resolution failure
  clipboard image handles -> artifact refs
  query screenshot request -> artifact refs + capture metadata
  workspace handle -> workspace metadata/context

SDK records turn-scoped metadata/resource-resolution events:
  user row metadata patches
  diagnostics/failures
  terminal turn_error if required

SDK assembles model-facing payload:
  user text
  memory context
  attachment context
  screenshots/artifacts
  workspace/repo instruction context

SDK sends backend transport.
```

This makes "send" a SDK-owned turn lifecycle, not a renderer preparation script
or a one-off Electron main enrichment callback.

## Why The Previous Plan Was Too Narrow

The deleted host-enrichment plan said "add a hook after SDK row emission." That
would still leave these weak points:

- The hook would be a catch-all payload mutator rather than a named turn input
  stage.
- Resource identity would still be implicit in ad hoc renderer payload fields.
- Failure semantics would be unclear: is a failed file read a query rejection, a
  user-message metadata failure, or a terminal turn error?
- There would be no reusable contract for CLI/custom SDK hosts that also need to
  resolve local resources.
- Tests would verify timing, but not the actual lifecycle architecture.

The replacement plan defines the durable abstraction first: SDK turn input
pipeline, host resource resolvers, evented resource-resolution state, then
backend payload assembly.

## Current Behavior

Current successful send path:

1. Renderer normalizes text and selected attachment payloads.
2. Renderer ensures conversation/session/workspace identity.
3. Renderer reads selected files through the local sidecar bridge.
4. Renderer captures/uploads screenshots or clipboard images.
5. Renderer invokes `conversation.send` with already-resolved context fields.
6. Electron main prepares backend query payload and calls the direct SDK runtime
   adapter.
7. SDK `ConversationRuntime.send()` emits `turn_started` and `user_message`.
8. SDK memory enrichment builds model-facing content and transport sends the
   backend query.

The duplicate renderer visible row is gone, but the first SDK row is still
blocked by renderer-owned resource resolution.

## Code Inspection Findings

### Renderer Still Resolves Attachments Before SDK Send

`frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
currently does the slow work before `DesktopLiveTurnRuntimeClient.sendQuery(...)`:

- `buildReadableFileAttachmentContext(readableFiles)` reads every selected file
  through renderer IPC before a SDK turn exists.
- `resolveQueryScreenshotArtifacts(...)` captures screenshots and materializes
  clipboard/screenshot images into artifact refs before a SDK turn exists.
- `PreparedDesktopChatTurn` stores already-resolved backend-ish fields:
  `attachmentContext`, `screenshotRef`, `screenshotRefs`, `screenshotUrl`, and
  `captureMeta`.

This means the renderer no longer owns a visible user row, but it still owns
resource resolution timing and backend-payload-shaped attachment semantics.

### Renderer Command Surface Sends Resolved Fields

`frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts` still sends
resolved fields on `conversation.send`:

- `screenshot_ref`
- `screenshot_url`
- `screenshot_refs`
- `capture_meta`
- `attachment_context`
- `attachment_filenames`
- `workspace_path`

The new contract should replace these successful-send inputs with typed turn
resources/handles, while preserving compatibility only at the final SDK
transport payload assembly boundary.

### SDK Already Has The Correct Row Timing Once Called

`packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` now emits:

1. `turn_started`
2. base `user_message`
3. SDK enrichment through `options.enrichQuery(...)`
4. `user_message_metadata`
5. backend transport

So the remaining delay is not inside SDK after `send()` begins. The delay is
that renderer does resource resolution before `send()` begins. The pipeline
change should insert resource resolution between steps 2 and 3.

### SDK Memory Enrichment Already Owns Model-Facing Content

`packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts` already turns
`attachment_context` into model-facing content and combines it with memory
retrieval. The new pipeline should feed resource-resolution output into this
existing enrichment stage rather than making renderer prebuild
`attachment_context`.

### Electron Main Direct Adapter Is The Desktop Host Integration Point

`frontend/src/main/ipc.cjs` creates the direct WakeUp adapter in
`createDirectWakeUpAgentAdapter(...)`. That adapter selects the SDK
conversation runtime and calls `activeRuntime.send(sendInput)`. This is the
right place to provide desktop resource resolvers to SDK-created conversation
runtimes, because Electron main already owns local authority and broadcasts SDK
rows/current-turn projections.

### Existing Local Authority Paths Can Be Reused

The implementation should reuse, not duplicate:

- `read-attachment-file` local tool path in
  `frontend/src/main/local_backend_bridge.cjs`.
- `capture-screenshot-attachment` local tool path in the same bridge.
- artifact upload behavior behind `upload-artifact` /
  `frontend/src/main/ipc/ipc_artifact_handlers.cjs`.
- overlay/capture shell preparation in `ipc_query_send_runtime.cjs` and main
  window runtime helpers.

## Target Ownership

| Surface | Owner | Rule |
| --- | --- | --- |
| Turn input contract | SDK | Typed reusable representation of user text, resource handles, and send policy. |
| Turn execution lifecycle | SDK `ConversationRuntime` | Starts turn, records base row, resolves resources, emits metadata/failure events, assembles transport payload. |
| Resource handles | Renderer or host UI | Describes what the user selected/requested; does not resolve local content before SDK turn start. |
| Resource resolvers | Host capability registry | Electron main implements desktop resolvers; other SDK hosts can register their own. |
| Local machine authority | Electron main + sidecar | Reads files, captures screenshots, uploads artifacts through existing authority paths. |
| Display metadata | SDK events/projection | User row metadata patches are evented and merged into stable display rows. |
| Model-facing payload assembly | SDK pipeline | Combines text, memory, resource outputs, and host context before backend transport. |
| Renderer chat/overlay | Renderer | Renders SDK display rows and presentation only. |

## First-Class Concepts

### TurnInput

The public SDK send input should distinguish:

- `text`: user-visible message text
- `conversationRef` / `turnRef`: identity
- `resources`: typed handles selected or requested by the user
- `sendPolicy`: host/UI hints such as query screenshot capture request
- `model`: optional model selection
- `metadata`: display-safe user metadata, not model-facing prompt content

### TurnInputResource

Initial resource kinds:

- `readable_file`: file path and filename selected by the user
- `clipboard_image`: image bytes/content type/filename from the composer
- `query_screenshot_request`: request to capture current screen after SDK turn
  start
- `workspace`: active workspace path/binding

The renderer may create handles because it owns the composer and selected UI
state. It should not read file contents, capture screenshots, or upload artifacts
before the SDK turn exists.

### TurnResourceResolver

The host registers resolvers by resource kind:

- Electron desktop resolver uses local sidecar tool execution for `read_file`
  and `screenshot`.
- Artifact materialization uses the existing artifact upload path.
- Non-Electron SDK consumers can omit resolvers or provide their own.

Resolvers return typed resource results, not arbitrary query payload patches.

### TurnInputPipeline

SDK owns the ordered stages:

1. Start turn.
2. Record base user row.
3. Resolve resources.
4. Emit diagnostics and `user_message_metadata` patches.
5. Build model-facing user content with memory and attachment context.
6. Send backend transport.
7. Settle terminal state.

## In Scope

- Add typed SDK turn input resource and resolver contracts.
- Refactor `ConversationRuntime.send()` to run an explicit turn input pipeline
  after base row emission and before backend transport.
- Keep memory enrichment in the SDK, but feed it resource-resolution output
  instead of renderer-prebuilt attachment context.
- Add SDK events or payload fields needed to diagnose resource resolution without
  creating renderer-local rows.
- Register Electron desktop resource resolvers from the direct WakeUp agent
  adapter or SDK startup options.
- Move successful-send readable-file and screenshot resolution out of renderer
  pre-send preparation.
- Keep renderer pre-send work limited to identity/session setup, selected handle
  collection, UI logging, and command dispatch.
- Preserve existing backend query payload shape where possible by translating
  SDK resource results into the current transport payload at the final pipeline
  stage.
- Update tests, docs, changelog, and the matching execution report.

## Out Of Scope

- Redesigning the visible chat UI.
- Replacing backend websocket query schema.
- Changing platform screenshot hiding/content-protection policy beyond moving
  when it is invoked.
- Replacing sidecar tools.
- Solving unrelated repo-wide lint failures.
- Removing legacy helper tests that are not production send-path owners.

## Workflow

1. Create a matching realtime report before runtime edits.
2. Add SDK tests for the lifecycle before implementation:
   - base user row emitted before delayed resource resolver finishes
   - resource metadata merges into the same user row
   - resource failure produces terminal `turn_error`
   - backend transport receives resource-enriched payload
3. Define SDK types:
   - `TurnInputResource`
   - `TurnResourceResolution`
   - `TurnResourceResolverRegistry`
   - `TurnInputPipeline` or equivalent internal helper
4. Update renderer command inputs to carry resources rather than resolved
   payload fields.
   - `OutgoingUserMessagePayload` remains the UI payload.
   - `PreparedDesktopChatTurn` should become a minimal turn command with
     `resources` and `sendPolicy`, not `attachmentContext` /
     `screenshotRef`-style fields.
   - `DesktopLiveTurnRuntimeClient.sendQuery(...)` should forward a SDK-shaped
     turn input resource list.
5. Implement the SDK pipeline in small slices:
   - normalize input into base display payload
   - resolve resources after base event emission
   - emit metadata/diagnostics
   - assemble payload for existing `ContextEnrichmentPipeline`
   - transport final backend payload
6. Wire Electron desktop resolvers:
   - `readable_file` through existing local sidecar read-file path
   - `query_screenshot_request` through existing screenshot capture path
   - clipboard image artifact materialization through existing artifact upload
7. Simplify renderer send preparation:
   - remove successful-path file read and screenshot capture/upload
   - pass resource handles/descriptors to `conversation.send`
   - keep renderer-local error rows only for failures before a valid SDK turn can
     exist
8. Inspect and classify remaining paths:
   - no successful-send `buildReadableFileAttachmentContext(...)`
   - no successful-send `resolveQueryScreenshotArtifacts(...)`
   - no successful-send renderer-local user row or attachment mutation
9. Update docs and changelog.
10. Validate and commit only this refactor's files.

## Success Criteria

- SDK user row appears before file reading, screenshot capture, artifact upload,
  memory enrichment, or backend transport finish.
- Renderer successful-send path submits resource handles, not resolved file
  context or screenshot artifacts.
- Resource resolution results update SDK display metadata through stable
  turn-scoped events.
- Backend receives the same effective information it receives today:
  attachment context, attachment filenames, screenshot refs/URLs/ref list,
  capture metadata, workspace context, and memory-enriched content.
- Resource resolution failures settle the SDK turn deterministically.
- The abstraction is reusable by non-Electron SDK hosts.
- No new generic bridge or rename-only adapter is introduced.

## Validation Commands

- `bin/windie docs list`
- `cd packages/windie-sdk-js && npm run build`
- Focused SDK/runtime tests, including new turn input pipeline tests.
- `cd frontend && npm test -- --runInBand ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts ../tests/frontend/IpcQuerySendRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/WindieSdkConversationRuntime.test.ts`
- `cd frontend && npm run typecheck`
- Focused ESLint on touched frontend files.
- `git diff --check`

## Reread Anchors After Compaction

- This plan.
- The matching realtime report.
- `docs/plans/2026-06-06-sdk-owned-live-turn-presentation-refactor-report.md`.
- `docs/sdk/conversation_runtime.md`.
- `docs/architecture/frontend_architecture.md`.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`.
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`.
- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`.
- `packages/windie-sdk-js/src/conversation/types.ts`.
- `frontend/src/main/ipc.cjs` around the direct WakeUp adapter.
- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`.
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`.

## Assumptions

- No durable data migration is required; this changes runtime event timing,
  SDK input shape, and IPC payload shape, not sidecar storage schema.
- Existing backend transport payload fields can be preserved for compatibility.
- Electron main has enough authority to implement desktop resource resolvers
  without moving local authority into renderer.
- If the implementation proves a resolver belongs inside SDK local runtime
  instead of Electron main, update this plan before coding that wider move.
