---
summary: "Deep reference for response overlay renderer behavior: phase-driven visibility, awaiting vs response states, closeability rules, and deterministic fixed-frame sizing IPC updates."
read_when:
  - When changing `ChatBoxResponse.jsx` rendering logic, overlay utility contracts, or response overlay UX states.
  - When debugging missing response panes, stale awaiting indicators, or incorrect response overlay resize behavior.
title: "Response Overlay Phase Runtime Reference"
---

# Response Overlay Phase Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize.js`
- `frontend/src/renderer/infrastructure/markdown.ts`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/UseResponseOverlayPhase.test.jsx`
- `tests/frontend/OverlayFrameSize.test.js`

## Input State and Message Selection

Primary inputs:

- `messages`
- `thinkingStatus`

Selection logic:

1. `useCurrentTurnPresentationState(...)` resolves the latest user turn boundary.
2. It projects the latest visible assistant reply only from rows after that boundary.
3. candidate row must be `sender="assistant"`, non-empty `text`, and `type` in allowed set (`llm-text`, `error`).

Closeability:

- `error` rows are closeable immediately.
- `llm-text` rows are closeable only when `isComplete === true`.

## Phase-Driven View Modes

Overlay phase channel: `response-overlay-phase`.

Payload normalization boundary:

- `responseOverlayPhasePayload.parseResponseOverlayPhasePayload(...)` is the canonical parser for phase + recovery metadata (`correlation_id`, `attempt`, `max_attempts`, `recovery_stage`, `failure_reason`).
- `overlayPhaseListener` forwards only parsed payloads; invalid phase strings are dropped.
- `useResponseOverlayPhase` consumes overlay phase via `useSyncExternalStore` against `overlayPhaseListener` snapshot/store subscription helpers, removing component-local `useEffect` wiring for this external event source.

Modes:

- `showResponse`:
  - assistant response exists
  - not awaiting first chunk
  - not manually dismissed
- `showAwaitingReply`:
  - awaiting mode / phase is `awaiting-first-chunk`, `tool-call`, or `tool-output`
  - local send fallback when chat workspace `isSending === true`
  - or chat thinking source is `context-compaction-started` with active compaction status text
  - no visible response row

Rendering:

- returns `null` when both modes are false.

## Response Pane Behavior

- `error` renders plain text.
- `llm-text` renders sanitized markdown.
- response pane height is fixed at `236px` while tokens stream.

Scroll behavior:

- tracks overflow-above class state.
- bottom-stick threshold keeps stream pinned until user scrolls up.

## Awaiting Indicator Behavior

- awaiting mode shows typing indicator.
- `awaiting-first-chunk` keeps loop click-through active but does not pre-show the response window from the main-process phase handler; the first visible show comes from the renderer's measured awaiting layout.
- `ChatBoxResponse` does not render a separate reasoning/thinking stream region.
- compaction status text alone does not render overlay content unless awaiting/response mode is active.

## Overlay Size IPC Contract

`set-responsebox-size` payloads:

- hidden: `{ visible: false, width: 0, height: 0 }`
- shown: `{ visible: true, width, height, compact_hover }`

Layout-specific sizing:

- `response` mode reports measured shell width + fixed response frame height
- `awaiting-typing` mode forces `height=24` and reports `compact_hover=true`
- `hidden` mode reports zero size and `visible=false`

Dedupe behavior:

- skips repeated identical size payloads.
- unmount cleanup always sends hidden payload.

## Tool-Ghost Status (Current)

Current production `ChatBoxResponse` runtime does not parse/render model tool-ghost previews from tool-call payload JSON.

Remaining tool-ghost UI pieces are debug-harness scoped (`ToolGhostDebugApp`, `ToolGhostCursor`) and documented in the sibling tool-ghost pages.

## Related Pages

- [Frontend Renderer Overlay Docs Hub](README.md)
- [Response Overlay Utility Contract Reference](response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](../chat/presentation/latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](tool_ghost/README.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
