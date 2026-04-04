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
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayWindowSync.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayScrollState.js`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/chatPill/chatPillSessionFlow.ts`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayViewContract.ts`
- `frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamDebugTrace.ts`
- `frontend/src/renderer/infrastructure/markdown.ts`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/UseResponseOverlayPhase.test.jsx`
- `tests/frontend/OverlayFrameSize.test.js`

## Input State and Message Selection

Primary inputs:

- `messages`
- `thinkingStatus`

Current-turn entry construction:

- `buildCurrentTurnResponseOverlayEntries(...)` scans assistant messages after the latest user boundary.
- entry types currently included:
  - `llm-text`
  - `error`
  - `tool-explanation` (derived from tool-call explanation fields, including unified wrapper paths such as `system_use.arguments.explanation` and `computer_use.arguments.metadata.explanation`)

Selection logic:

1. `useCurrentTurnPresentationState(...)` resolves loop state and latest visible assistant reply for compact/awaiting behavior.
2. `resolveChatPillViewIntent(...)` uses the response-overlay entry list to resolve overlay visibility.
3. `showResponse` is true when current-turn entry list is non-empty and not dismissed, even when latest entry is a `tool-explanation`.
4. during `preflight` / `awaiting` lifecycle only, a still-mounted prior visible response with the same entry id is treated as stale so the typing indicator can appear immediately for the new turn before the response window's local message store catches up.

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
  - response-overlay entry list for current turn is non-empty (`llm-text`, `error`, and/or `tool-explanation`)
  - entry id is not manually dismissed
- `showAwaitingReply`:
  - no visible response-entry list
  - and current-turn presentation state reports awaiting-reply mode
  - or the only visible response entry is the stale prior-turn response during `preflight` / `awaiting`

Contract ownership:

- `resolveResponseOverlayViewContract(...)` is the canonical pure helper for:
  - latest visible response entry id
  - `showResponse`
  - `showAwaitingReply`
  - overlay layout mode (`hidden` / `awaiting-typing` / `response`)
- `resolveChatPillViewIntent(...)` layers turn-id selection on top of that contract for renderer trace/debug output.
- `useResponseOverlayViewModel(...)` owns the renderer-side composition boundary: current-turn presentation state, response-entry derivation, rendered markdown payloads, closeability, and stale-response suppression during preflight/awaiting.
- `useResponseOverlayWindowSync(...)` owns response-window sizing IPC and visibility re-report behavior.
- `useResponseOverlayScrollState(...)` owns fixed-height transcript scroll pinning and overflow affordance state.

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

## Debug Trace Contract

Under `WINDIE_DEBUG_STREAM_EVENTS=1` (main injects `?debug_stream=1`) or explicit `?debug_chat_pill=1`:

- renderer emits `[ChatPillTrace][renderer]` with:
  - workspace/stream snapshot
  - `turn_id`
  - phase
  - layout mode
  - `show_response`
  - `show_awaiting_reply`
- `useChatMessageSender` logs send start and backend dispatch intent
- `queryScreenshotPipeline` logs auto-capture decision
- `ChatBoxResponse` logs the resolved overlay view contract each render pass that matters

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
