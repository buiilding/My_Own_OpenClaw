---
summary: "Plan to unify dashboard and minimal chat pill response rendering behind one SDK-owned chat presentation model."
read_when:
  - When changing dashboard chat rendering, minimal chat pill response overlay rendering, SDK current-turn presentation, or live transcript projection.
  - When debugging differences between the always-on-top pill/response overlay and the main dashboard chat thread.
title: "Unified Chat Presentation Plan"
---

# Unified Chat Presentation Plan

Date: 2026-06-15

## User Intent

Make the minimal chat pill and response overlay a smaller always-on-top version
of the dashboard chat, not a parallel implementation. The user should see the
same live assistant content, thinking disclosure behavior, tool/progress rows,
markdown rendering, and transcript semantics whether they stay in the pill or
open the dashboard during an active agent loop.

The cleanup should use the existing SDK current-turn projection as the live
source of truth. It should not revive raw backend stream rendering in React,
add a second renderer-owned stream path, or copy dashboard rendering logic into
the response overlay.

## Current Problem

The dashboard and response overlay currently share runtime data but not the
same presentation path:

- SDK `currentTurnProjection.presentation.entries` already contains live
  current-turn content for the response overlay.
- The response overlay renders those entries through a custom overlay-only
  renderer in `MinimalResponseOverlay`.
- The dashboard renders durable chat rows through `MessageList`, `MessageItem`,
  and `MessageContent`.
- The dashboard uses current-turn projection for busy, Stop, awaiting, and some
  ephemeral thinking state, but it does not render the same live presentation
  entries as the overlay.

This creates two product surfaces with different semantics, even though the
minimal pill is supposed to be the compact shell for the same chat experience.

## Target Architecture

The source-of-truth shape should be:

```text
SDK ConversationRuntime
  -> displayRows + currentTurnProjection
      -> shared chat presentation model
          -> dashboard full chat shell
          -> minimal response overlay compact chat shell
```

Runtime ownership stays unchanged:

- SDK runtime owns conversation events, display rows, current-turn projection,
  live presentation entries, busy state, turn refs, and conversation refs.
- Renderer owns display projection, message components, and surface-specific
  layout.
- Electron main owns BrowserWindow visibility, always-on-top behavior,
  click-through, focus, size, surface handoff, and tool leases.
- Backend and sidecar ownership do not change.

The important boundary is that live current-turn content is ephemeral UI
projection. It must not be written into transcript history by the renderer.

## Design Principles

- One assistant message renderer: dashboard and overlay should both render
  normal chat message objects through the shared chat message components.
- Two shells: dashboard and pill may have different layout, chrome, dimensions,
  scrolling, and controls.
- No duplicate markdown/tool/thinking renderer in the overlay.
- No raw backend stream fallback in renderer state.
- No Electron-main ownership of content projection.
- No compatibility shim that keeps the custom overlay renderer alive after the
  shared renderer is working.

## In Scope

- Build a shared live chat presentation projection that merges durable SDK
  display-row messages with ephemeral SDK current-turn messages.
- Make dashboard chat render live current-turn assistant content, thinking,
  tool progress, tool calls, tool outputs, and errors from that shared
  projection during active turns.
- Make the response overlay render a compact/windowed view of the same shared
  projected messages using the same chat message components as the dashboard.
- Delete or narrow overlay-only entry rendering helpers after the shared path
  replaces them.
- Preserve response overlay window sizing, closeability, hit testing, and
  Electron surface handoff behavior.
- Add focused tests proving the dashboard and overlay consume the same live
  projection and that live rows are not persisted as transcript history.
- Update docs that describe dashboard, pill, overlay, and SDK current-turn
  presentation ownership.

## Out Of Scope

- Redesigning the dashboard layout, sidebar, model controls, memory page,
  settings page, or chat history library.
- Replacing the minimal chat pill BrowserWindow or Electron surface runtime.
- Changing backend streaming event contracts.
- Changing sidecar tool execution.
- Changing provider reasoning policies or deciding whether thinking should be
  hidden by product policy. This plan only unifies existing presentation
  behavior.
- Adding new STT, TTS, camera, attachment, or model-selector features.

## Proposed Workflow

### 1. Inspect Current Presentation Boundaries

Reread the current renderer paths before editing:

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageItem.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js`
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`

Classify each path as one of:

- shared projection
- dashboard shell
- compact overlay shell
- Electron window policy
- legacy/parallel renderer to delete

### 2. Define A Shared Live Presentation Projection

Create or extend a shared renderer utility that accepts:

- durable chat messages from SDK display rows
- `currentTurnProjection`
- current active conversation ref
- optional surface mode such as `dashboard` or `compact-overlay`

The utility should return normal chat message objects shaped for
`MessageItem`/`MessageContent`, plus small metadata for awaiting and active turn
state when needed.

Rules:

- Use `currentTurnProjection.presentation.entries` when present.
- Fall back to `buildCurrentTurnMessagesFromProjection(...)` only for older
  projections without SDK presentation entries.
- Guard every live row by conversation ref and turn ref.
- Insert live rows after the matching active user turn.
- Dedupe against durable SDK display-row messages by stable row/entry identity,
  turn ref, and message type.
- Keep live rows ephemeral. Do not call `setMessages(...)` with live-only rows.

### 3. Move Dashboard To The Shared Projection

Change `ChatInterface` so `renderedMessages` comes from the shared projection
instead of the current narrower `buildThreadPresentationMessages(...)` behavior.

Expected behavior:

- While the agent loop is active, dashboard shows the same live assistant
  content the overlay would show.
- Live thinking uses the same `AssistantThinkingSection` disclosure behavior as
  durable assistant messages.
- Tool progress and tool call rows use the same message components as durable
  tool rows.
- When `windie:rows` materializes durable rows, duplicate live rows disappear
  or merge cleanly.

### 4. Move Response Overlay To Shared Message Rendering

Replace the overlay-only entry renderer in `MinimalResponseOverlay` with shared
chat message rendering.

Expected behavior:

- The response overlay receives a compact list of current-turn projected chat
  messages.
- It renders those messages through `MessageItem`/`MessageContent` or a narrow
  shared message-list primitive that uses the same content components.
- Overlay-specific logic remains only for window shell concerns: fixed height,
  scroll container, close button, awaiting shell, hit testing, size sync, and
  Electron visibility reports.
- Source/debug badges follow the same dev-mode rules as dashboard instead of
  being hardcoded into the overlay UI.

### 5. Delete Or Collapse Parallel Overlay Helpers

After the shared renderer is in place, inspect for old overlay-only projection
or rendering helpers that are no longer needed:

- `renderResponseEntry(...)`
- overlay-only markdown sanitization paths
- overlay-only source-tag rendering that duplicates message source badges
- entry normalization that exists only to feed custom overlay markup

Delete the parallel path unless it still enforces a real compact-shell concern.
If any helper remains, document why it belongs to shell/layout rather than chat
content rendering.

### 6. Tests

Add or update focused tests for:

- shared projection inserts active SDK presentation entries after the matching
  active user turn
- stale current-turn entries from another conversation or turn do not render
- dashboard renders live assistant text before terminal display rows arrive
- dashboard suppresses duplicate live rows once display rows include the same
  assistant/tool content
- overlay renders through shared message content, not custom entry rendering
- live current-turn rows are not persisted into chat store `messages`
- Stop/busy/awaiting behavior still follows SDK current-turn projection
- response overlay closeability and awaiting shell still work

Likely test files to inspect or extend:

- `tests/frontend/MessagePresentationPipeline.test.js`
- `tests/frontend/ChatInterfaceWiring.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/LiveTurnSurfaceState.test.js`
- `tests/frontend/RendererChatRuntimeBoundary.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`

### 7. Docs

Update docs after implementation:

- `docs/desktop/minimal_chat_pill.md`
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- any relevant renderer reference docs that still describe the dashboard and
  overlay as separate content renderers

Docs should state that SDK current-turn projection is the live content source
for both surfaces, while Electron main only owns the native surface shell.

## Success Criteria

- Dashboard and response overlay render live assistant content from the same
  shared projection.
- Minimal response overlay no longer has a separate markdown/tool/thinking
  content renderer.
- Opening the dashboard from the pill during an active loop keeps live content
  visible in the dashboard instead of waiting only for terminal transcript rows.
- Closing or hiding the response overlay does not mutate durable transcript
  state.
- No stale current-turn content leaks across conversation switches.
- Live current-turn rows are never written into renderer transcript history as
  durable messages.
- Tests prove the shared projection, stale guards, dedupe behavior, and compact
  overlay rendering.
- Docs describe the single presentation path and the remaining shell-only
  differences between dashboard and pill.

## Validation Commands

Run the smallest relevant set first, then widen if touched code requires it:

```bash
bin/windie docs list
cd frontend && npm run test -- MessagePresentationPipeline
cd frontend && npm run test -- ChatInterfaceWiring
cd frontend && npm run test -- ChatBoxResponse
cd frontend && npm run test -- LiveTurnSurfaceState
cd frontend && npm run test -- RendererChatRuntimeBoundary
cd frontend && npm run test -- ChatStreamThinkingStatus
cd frontend && npm run lint
git diff --check
```

If UI layout is touched beyond pure component wiring, verify manually with:

```bash
bin/windie start dev
```

Manual verification scenario:

1. Start an agent turn from the minimal chat pill.
2. Confirm response overlay shows live current-turn content.
3. Click the pill config button to open dashboard chat while the turn is still
   active.
4. Confirm the floating overlay hides as expected.
5. Confirm dashboard chat shows the same live assistant content inline.
6. Let the turn complete.
7. Confirm durable transcript rows replace or merge with live rows without
   duplicates.
8. Switch conversations and confirm no stale live rows remain.

## Reread Anchors After Compaction

If context compacts or work resumes later, reread in this order:

1. This plan.
2. Matching report, once created:
   `docs/plans/2026-06-15-unified-chat-presentation-report.md`
3. `docs/development/agent_runtime_ownership_and_change_routing.md`
4. `docs/desktop/minimal_chat_pill.md`
5. `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
6. Current git diff for the files listed in the inspection section.
7. Tests listed in the test section.

## Approval Gate

This plan should be reviewed before implementation. The intended implementation
is not a new overlay feature; it is a cleanup that makes the dashboard message
renderer the canonical chat presentation and makes the pill/response overlay a
compact shell over the same live presentation model.
