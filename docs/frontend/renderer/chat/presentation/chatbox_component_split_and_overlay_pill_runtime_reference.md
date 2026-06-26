---
summary: "Deep reference for minimal chat pill component split and runtime contracts across `MinimalChatPill`, `MinimalResponseOverlay`, and shared chatbox helper modules."
read_when:
  - When changing `MinimalChatPill.jsx`, `MinimalResponseOverlay.jsx`, or shared chatbox helper modules.
  - When debugging overlay pill drag/focus behavior, screenshot preview lane state, or response-overlay resize/report timing.
title: "Chatbox Component Split and Overlay Pill Runtime Reference"
---

# Minimal Chat Pill Component Split and Overlay Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/components/PillIcons.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/AttachmentPreviewRow.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js`
- `frontend/src/renderer/app/runtime/desktopChatboxLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatboxInteractionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Component-Split Boundary

Minimal pill support modules live under `features/minimalChatPill/components/`
and reuse shared chat hooks/state:

- icon render-only exports (`PillIcons.jsx`)
- preview-row render-only component (`AttachmentPreviewRow.jsx`)

`MinimalChatPill.jsx` and `MinimalResponseOverlay.jsx` stay as orchestration
components; presentational helpers are kept inside the minimal pill feature.

Current-turn presentation ownership moved to shared chat hooks/state:

- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`

`useChatSurfaceController(...)` is the shared pill/dashboard control contract
for SDK current-turn busy state, stop availability, speech mode toggles,
query-screenshot toggles, wakeword-STT enablement, and manual compaction
dispatch. It receives selector-projected `chatSurfaceState` from
`DesktopChatSurfaceSelectorRuntime`, which suppresses raw current-turn authority
when a `ConversationView` exists and keeps only the local pending bridge
covering the pre-SDK-open gap.
`response-overlay-phase` is a window/layout hint and must not be used as chat
runtime truth.
`MinimalChatPill.jsx` and `ChatInterface.jsx` should keep layout, focus, window,
workspace, and model-menu behavior local to their surfaces. The dashboard may
opt into active-turn manual compaction; the minimal pill keeps manual
compaction behind its loop lock.

## `MinimalChatPill` Runtime Contract

### Send and Loop Locking

- uses `useChatMessageSender(undefined, { senderSurface: "overlay-chatbox" })`
- derives loop lock via `useChatSurfaceController({ chatSurfaceState })`
- selector-projected `chatSurfaceState` is the visible turn source;
  raw `isSending` remains store-local cleanup state and does not enter the
  surface controller or surface trace boundary
- loop lock disables:
  - dashboard-open button
  - screenshot capture button
  - speech toggle
  - input field and send path

### Focus and Wakeword Trigger

- input focus on mount through `useChatboxFocusBindings`
- explicit refocus only on the chatbox-focus event via `DesktopWindowRuntimeClient`
- text input DOM focus and caret placement through
  `DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd(...)`
- wakeword STT trigger via `DesktopWindowRuntimeClient` starts STT session only when `wakeword_stt_enabled === true`
- loop lock blocks refocus and blurs input while active
- unfocused textarea pointer-down reports a text-entry activation reason through
  `DesktopWindowRuntimeClient.activateChatboxTextEntryForReason(...)`, but must
  not consume a press-and-hold drag gesture

### Drag and Move IPC

- drag starts from pill pointer-down capture for primary-button gestures, with
  `onMouseDown` retained as a fallback
- buttons, icons, and the text input all participate in the same tentative
  drag start instead of using a separate blocked-target selector guard
- drag tracking starts from pointer-down capture and listens for pointer
  movement first, with mouse movement as a fallback, so a prevented first
  pointer-down used for focus handoff can still become a drag
- drag move is ignored until distance reaches the shared `5px` Manhattan
  threshold in `DesktopChatboxLayoutRuntime`
- absolute move dispatch:
  - `DesktopWindowRuntimeClient.moveChatboxTo({ x, y })`

### Renderer Trace Ownership

- `DesktopRendererTraceRuntime` owns minimal chat pill live-surface trace
  payload shaping for send reset, mount/unmount lifecycle, and normal hit-test
  intent. `MinimalChatPill.jsx` reports values through
  `logRendererChatPillResetTrace(...)`,
  `logRendererChatPillLifecycleTrace(...)`, and
  `logRendererChatPillHitTestTrace(...)` instead of assembling
  `turn_surface.reset`, `renderer.chat_pill.*`, `chat_pill.hit_test.set`, or
  `ignoreMouseEvents` fields locally.
- `DesktopChatPillSessionRuntime` owns the current-turn and `ConversationView`
  snapshot projection and lifecycle/reset trace value construction passed into
  those trace calls, so the component does not branch over SDK surface fields or
  unpack turn identity just to log pill lifecycle/state diagnostics.
- The same runtime owns response-overlay `turnId` precedence for the pill:
  visible SDK response rows win, then SDK overlay intent/visible lifecycle, then
  the short pending-send bridge. `useResponseOverlayViewModel(...)` passes those
  inputs through and does not compose turn-ref fallbacks in React.

### Screenshot Preview Lane and Visual Anchor

- screenshot button toggles query screenshot resource capture for the next send
- preview lane state (`with-preview`) is driven only by image count
- visual-anchor layout is resolved through
  `DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight(...)`
- visual-anchor browser scheduling is owned by
  `DesktopChatboxInteractionRuntime.startChatboxVisualAnchorSync(...)`
- visual-anchor IPC payload assembly is owned by
  `DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(...)`; the pill
  reports measured height values and optional native-frame height values.
- drag-state, current window-position reads, and absolute move targets are
  resolved through `DesktopChatboxLayoutRuntime` before dispatching native
  movement IPC
- drag window listeners are installed through
  `DesktopChatboxInteractionRuntime.subscribeToChatboxDragWindowEvents(...)`
- pointer hit-test listeners and pill-bounds checks are installed through
  `DesktopChatboxInteractionRuntime.subscribeToChatboxHitTestEvents(...)`
- close-button anchor measurement, resize listener wiring, observer callbacks,
  and animation-frame scheduling are installed through
  `DesktopChatboxInteractionRuntime.startChatboxCloseButtonAnchorSync(...)`
- native-frame collapse timeout scheduling is installed through
  `DesktopChatboxInteractionRuntime.scheduleChatboxNativeFrameCollapse(...)`
  and cleaned up through
  `DesktopChatboxInteractionRuntime.clearChatboxNativeFrameCollapse(...)`
- post-presize composer height commits are scheduled through
  `DesktopChatboxInteractionRuntime.scheduleChatboxComposerHeightCommit(...)`
  so sequence-guarded animation-frame behavior stays outside the component
- explicit chatbox text-entry focus/caret mechanics are owned by
  `DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd(...)`
- visual-anchor IPC sync:
  - preview off -> `height: 64`
  - preview on -> `height: 116`
- unmount resets anchor to compact height

No renderer-driven `set-chatbox-size` resizing occurs in this component.
Main-process chat window height now tracks the compact-vs-preview visual-anchor state so the idle overlay hit area stays tight to the visible pill instead of keeping the old taller transparent frame.
- resize-driven anchor updates are coalesced to one animation-frame commit so multiline growth reports the settled shell height instead of transient intermediate measurements.

### Optional Dev Compaction Control

- compaction button renders only when
  `DesktopDevUiRuntime.isDevUiEnabled()` is true
- on click:
  - sets compaction thinking status markers in chat store
  - calls `DesktopConversationContinuityService.compactHistory(true)`

## `ChatBoxResponse` Runtime Contract

### Response Selection and Visibility

- response overlay entries are built from SDK `currentTurnProjection`
- candidate response types are restricted to `llm-text` and `error`
- response-overlay turn identity is selected from the projected visible/active
  response, then the visible lifecycle turn; it does not fall back to raw chat
  message rows
  through `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
- dismissed response ids are tracked in `closedResponseId`

Closeability:

- error responses are closeable
- non-error responses require `isComplete === true`

### Awaiting vs Response Surface

- phase input comes from SDK `currentTurnProjection.phase`
- surface state is derived through `useResponseOverlayViewModel(...)`
- `ChatBoxResponse.jsx` now delegates current-turn/view-intent composition to `useResponseOverlayViewModel(...)`, response-window sizing IPC to `useResponseOverlayWindowSync(...)`, and fixed-height transcript scroll behavior to `useResponseOverlayScrollState(...)`
- awaiting indicator and response pill are mutually controlled by that state projection
- `response-overlay-phase` is not a runtime truth source for typing, response
  content, closeability, or stop/busy state

### Response Render and Formatting

- llm-text responses render sanitized markdown HTML via
  `resolveLlmOutputContract(...)` + `toSanitizedMarkdownHtml(...)`
- error responses render plain text block
- fixed response pill height is `236px`

### Overlay Size Reporting

- uses `set-responsebox-size` IPC payload with `{ visible, width, height, compact_hover }`
- awaiting typing mode forces height to `24px` for stable shell sizing
- no-op dedupe avoids duplicate size IPC sends when frame/layout state is unchanged
- `response-overlay-visibility` hide/show triggers re-report when overlay becomes visible again

### Scroll Affordance

- top overflow class `has-overflow-above` toggles when `scrollTop > 2`
- bottom stick logic keeps auto-scroll pinned unless user has scrolled away from bottom

## Test-Backed Invariants

`ChatBoxOverlayMouseIgnore.test.jsx` validates:

- no renderer-managed click-through toggles or host-shaped hit-test payloads;
  `MinimalChatPill` reports boolean active state through
  `DesktopWindowRuntimeClient.setChatboxHitTestActiveValue(...)`
- no `set-chatbox-size` resize path in chatbox pill runtime
- preview lane class/anchor-height transitions and sender-surface wiring
- drag coordinate emission, explicit focus behavior, and loop-lock control disabling

`ChatBoxResponse.state.test.jsx` validates:

- awaiting indicator transitions across overlay phases
- stale prior-response suppression during new-turn preflight without regressing current-turn tool-phase transcript visibility
- closeability matrix for incomplete/error responses
- fixed response height and overlay re-report after visibility restore

## Drift Hotspots

1. Reintroducing imports from removed legacy helper paths outside `components/chatbox/*`.
2. Mixing `isSending` and overlay-phase locking policies outside `DesktopVisibleTurnLifecycleRuntime`.
3. Re-adding renderer-driven `set-chatbox-size` logic in `ChatBox` can reintroduce startup flicker.
4. Changing response selection bounds (latest-after-user scan) can leak stale assistant rows into
   overlay response state.

## Related Docs

- [Renderer Chat Presentation Docs Hub](README.md)
- [Frontend Renderer Chat Docs Hub](../README.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](../../overlays/response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
