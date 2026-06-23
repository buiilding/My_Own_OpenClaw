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
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js`
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

1. `useResponseOverlayViewModel(...)` builds the current-turn entry list.
2. `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
   picks the turn-bounded candidate reply and applies dismissal state.
3. The visible-lifecycle-stamped presentation state decides:
  - awaiting indicator visibility
  - response-pill visibility

Closeability:

- error row: closeable immediately
- non-error row: closeable only when complete (`isComplete === true`)
- close control is anchored to the response frame outside the scrollable
  response pill, so users can dismiss a closeable long response without
  scrolling back to the top

## Overlay Size IPC Contract

Main-process size updates are sent through:

- `DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({ visible, width, height, compactHover, turnRef, staleGuardRef })`

The runtime client owns conversion from renderer value names to the
`set-responsebox-size` host payload (`compact_hover`, `turn_ref`,
`stale_guard_ref`, and optional `dismissed`). The window-sync hook owns only
visibility, measurement, dedupe, and re-report timing.

Response-window size stream traces are shaped by
`DesktopRendererTraceRuntime`. The window-sync hook passes camelCase
value-level fields to `logRendererResponseSurfaceSizeTrace(...)`; it does not
assemble diagnostic `layout_mode`, `response_visible`, `thinking_text_length`,
`compact_hover`, `turn_ref`, or `stale_guard_ref` fields directly.

Behavior:

- hidden mode sends `{ visible:false, width:0, height:0 }`
- visible mode reports rounded shell size from
  `DesktopResponseOverlayLayoutRuntime.getRoundedFrameSize(...)`
- awaiting-typing mode overrides height to `24`
- repeated identical frame/layout payloads are deduped

Visibility re-report rule:

- on `DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility(...)` show
  event, the runtime client has already normalized the host payload and emits a
  boolean visibility value; renderer schedules re-report through
  `DesktopResponseOverlayInteractionRuntime.scheduleResponseOverlayFrame(...)`
  when overlay should be visible
- on hide event, cached frame state resets so next show forces fresh size report
- visible resize retry, animation-frame coalescing, `ResizeObserver`, and
  cleanup are installed through
  `DesktopResponseOverlayInteractionRuntime.startResponseOverlaySizeUpdateSync(...)`
  while `useResponseOverlayWindowSync(...)` keeps the sizing policy.

## Scroll-Anchor Policy

`responsePillRef` state tracks:

- `hasOverflowAbove`: `scrollTop > 2`
- `shouldStickToBottomRef` from distance-to-bottom threshold (`<= 20`)

When active response updates:

- if user remained near bottom, component auto-scrolls to newest content
- if user scrolled upward, manual position is preserved
- close-button availability is independent from `responsePillRef` scroll
  position because the close button is a sibling of the scroll container

## Markdown/Error Rendering Contract

- `llm-text` rows: `resolveLlmOutputContract(...)` -> `toSanitizedMarkdownHtml(...)` -> markdown render path
- `error` rows: plain-text render path (`chatbox-response-plain`)

This keeps response HTML sanitation and error rendering behavior deterministic under the fixed-height shell.

## Drift Hotspots

1. Reintroducing dynamic response height measurement can break fixed-shell assumptions in overlay positioning.
2. Removing visibility-show re-report can leave stale response window bounds after capture hide/show cycles.
3. Changing bottom-stick threshold without tests can create jumpy scroll behavior for streaming responses.
4. Rebuilding response-window stream-trace field names in
   `useResponseOverlayWindowSync(...)` duplicates the trace runtime boundary.

## Related Pages

- [Renderer Chat Response-Overlay Presentation Docs Hub](README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](../chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Response Overlay Phase Runtime Reference](../../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](../../../overlays/response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
