---
summary: "Deep reference for chatbox overlay component split and runtime contracts across `ChatBox`, `ChatComposerSurface`, `ChatBoxResponse`, and `components/chatbox/*` helpers."
read_when:
  - When changing `ChatBox.jsx`, `ChatBoxResponse.jsx`, or the extracted `components/chatbox/*` helper modules.
  - When debugging overlay pill drag/focus behavior, screenshot preview lane state, or response-overlay resize/report timing.
title: "Chatbox Component Split and Overlay Pill Runtime Reference"
---

# Chatbox Component Split and Overlay Pill Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatComposerSurface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/components/chatbox/ChatBoxIcons.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatBoxBindings.js`
- `frontend/src/renderer/features/chat/utils/state/chatBoxState.js`
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Component-Split Boundary

Chatbox support modules now split between:

- icon render-only exports (`ChatBoxIcons.jsx`)
- shared composer render/layout (`ChatComposerSurface.jsx`)

`ChatBox.jsx` and `ChatBoxResponse.jsx` stay as orchestration components.

Current-turn presentation ownership moved to shared chat hooks/state:

- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`

## `ChatBox` Runtime Contract

### Send and Loop Locking

- uses `useChatMessageSender(undefined, { senderSurface: "overlay-chatbox" })`
- derives loop lock via `useCurrentTurnPresentationState({ phase, isSending, messages })`
- loop lock disables:
  - dashboard-open button
  - screenshot capture button
  - speech toggle
  - input field and send path

### Focus and Wakeword Trigger

- input focus on mount through `useChatboxFocusBindings`
- explicit refocus only on `chatbox-focus` IPC event
- `wakeword-stt-trigger` IPC starts STT session only when `wakeword_stt_enabled === true`
- loop lock blocks refocus and blurs input while active

### Drag and Move IPC

- drag starts from pill `onMouseDown` only for primary button and non-interactive targets
- blocked targets are defined by `isDragBlockedTarget(...)` selector guard
- drag move is ignored until distance is at least 2 pixels
- absolute move dispatch:
  - `IpcBridge.send("move-chatbox-to", { x, y })`

### Shared Composer Surface and Visual Anchor

- screenshot button toggles `include_query_screenshot` in frontend config
- explicit and pasted attachments flow through the shared composer draft state and render through the
  shared preview rows
- input surface and preview-row markup are now shared with dashboard `MessageInput`
- visual-anchor IPC sync is driven by the measured shared composer surface height, with `64px`
  remaining the compact minimum
- unmount resets anchor to compact height

No renderer-driven `set-chatbox-size` resizing occurs in this component.
Main-process chat window height now tracks measured composer-height updates so the idle overlay hit
area stays tight to the visible pill instead of relying on the old compact-vs-preview shell states.

### Optional Dev Compaction Control

- compaction button renders only when `isDevUiEnabled()` is true
- on click:
  - sets compaction thinking status markers in chat store
  - calls `ApiClient.compactHistory(true)`

## `ChatBoxResponse` Runtime Contract

### Response Selection and Visibility

- candidate response types are restricted to `llm-text` and `error`
- latest assistant response is selected only from messages after the latest user message
  through `useCurrentTurnPresentationState(...)`
- dismissed response ids are tracked in `closedResponseId`

Closeability:

- error responses are closeable
- non-error responses require `isComplete === true`

### Awaiting vs Response Surface

- phase input from `useResponseOverlayPhase()`
- surface state is derived through `useCurrentTurnPresentationState(...)`
- awaiting indicator and response pill are mutually controlled by that state projection

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

- no renderer-managed click-through toggles
- no `set-chatbox-size` resize path in chatbox pill runtime
- preview lane class/anchor-height transitions and sender-surface wiring
- drag coordinate emission, explicit focus behavior, and loop-lock control disabling

`ChatBoxResponse.state.test.jsx` validates:

- awaiting indicator transitions across overlay phases
- stale-response hide and same-id token unlock behavior
- closeability matrix for incomplete/error responses
- fixed response height and overlay re-report after visibility restore

## Drift Hotspots

1. Reintroducing imports from removed legacy helper paths outside `components/chatbox/*`.
2. Mixing `isSending` and overlay-phase locking policies outside `useCurrentTurnPresentationState(...)`.
3. Reintroducing overlay-only composer geometry or clip-path shaping can re-create visual drift with
   dashboard `MessageInput`.
4. Re-adding renderer-driven `set-chatbox-size` logic in `ChatBox` can reintroduce startup flicker.
5. Changing response selection bounds (latest-after-user scan) can leak stale assistant rows into
   overlay response state.

## Related Docs

- [Renderer Chat Presentation Docs Hub](README.md)
- [Frontend Renderer Chat Docs Hub](../README.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](../../overlays/response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
