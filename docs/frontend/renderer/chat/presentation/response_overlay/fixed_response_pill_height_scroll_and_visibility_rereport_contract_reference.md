---
summary: "Deep reference for `MinimalResponseOverlay` fixed-height runtime behavior: reply/awaiting mode projection, scroll-anchor policy, and visibility-triggered overlay size re-report semantics."
read_when:
  - When changing `MinimalResponseOverlay.jsx` response-pill sizing, awaiting indicator sizing, or scroll behavior.
  - When debugging stale response overlay dimensions after hide/show, missing auto-stick scroll, or incorrect response closeability gating.
title: "Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference"
---

# Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayRuntimeClient.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Fixed Size Constants

`MinimalResponseOverlay.jsx` defines:

- `RESPONSE_FIXED_HEIGHT = 236`
- `TYPING_FRAME_HEIGHT = 24`
- `RESPONSE_BOTTOM_STICK_THRESHOLD = 20`

Contract:

- response mode always renders fixed `236px` pill height
- awaiting-typing reports `24px` overlay height for stable compact shell behavior
- awaiting-typing uses dedicated typing-indicator surface, border, dot, and shadow
  tokens so light appearance cannot collapse into white-on-white dots
- no response-content auto-resize hook participates in runtime sizing

## Response Selection and Visibility

Selection pipeline:

1. `useCurrentTurnPresentationState(...)` picks the turn-bounded candidate reply.
2. `hasVisibleChatboxResponse(...)` applies dismissal state (`closedResponseId`).
3. The same shared current-turn presentation state decides:
  - awaiting indicator visibility
  - response-pill visibility

Closeability:

- error row: closeable immediately
- non-error row: closeable only when complete (`isComplete === true`)

## Overlay Size IPC Contract

Main-process size updates are sent through:

- `DesktopResponseOverlayRuntimeClient.setResponseboxSize({ visible, width, height, compact_hover })`

Behavior:

- hidden mode sends `{ visible:false, width:0, height:0 }`
- visible mode reports rounded shell size from `getRoundedFrameSize(...)`
- awaiting-typing mode overrides height to `24`
- repeated identical frame/layout payloads are deduped

Visibility re-report rule:

- on `DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility(...)` show
  event, renderer schedules re-report on next animation frame when overlay
  should be visible
- on hide event, cached frame state resets so next show forces fresh size report

## Scroll-Anchor Policy

`responsePillRef` state tracks:

- `hasOverflowAbove`: `scrollTop > 2`
- `shouldStickToBottomRef` from distance-to-bottom threshold (`<= 20`)

When active response updates:

- if user remained near bottom, component auto-scrolls to newest content
- if user scrolled upward, manual position is preserved

## Markdown/Error Rendering Contract

- `llm-text` rows: `resolveLlmOutputContract(...)` -> `toSanitizedMarkdownHtml(...)` -> markdown render path
- `error` rows: plain-text render path (`chatbox-response-plain`)

This keeps response HTML sanitation and error rendering behavior deterministic under the fixed-height shell.

## Drift Hotspots

1. Reintroducing dynamic response height measurement can break fixed-shell assumptions in overlay positioning.
2. Removing visibility-show re-report can leave stale response window bounds after capture hide/show cycles.
3. Changing bottom-stick threshold without tests can create jumpy scroll behavior for streaming responses.

## Related Pages

- [Renderer Chat Response-Overlay Presentation Docs Hub](README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](../chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Response Overlay Phase Runtime Reference](../../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](../../../overlays/response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
