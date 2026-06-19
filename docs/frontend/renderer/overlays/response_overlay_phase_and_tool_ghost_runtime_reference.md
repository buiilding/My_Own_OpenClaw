---
summary: "Deep reference for response overlay renderer behavior: SDK current-turn presentation, pending-turn preflight handoff, hidden SDK startup projection handoff, closeability rules, and deterministic fixed-frame sizing IPC updates."
read_when:
  - When changing `MinimalResponseOverlay.jsx` rendering logic, overlay utility contracts, or response overlay UX states.
  - When debugging missing response panes, stale awaiting indicators, hidden SDK presentation handoff, local pending-turn preflight flicker, removed `prime-response-overlay-awaiting`, or incorrect response overlay resize behavior.
title: "Response Overlay Phase Runtime Reference"
---

# Response Overlay Phase Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayRuntimeClient.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayScrollState.js`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`
- `frontend/src/renderer/infrastructure/markdown.ts`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/LiveTurnSurfaceState.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Input State and Message Selection

Primary inputs:

- SDK `currentTurn` projection from `conversation-runtime-updated`
- `messages`
- `thinkingStatus`

Current-turn entry construction:

- when SDK `currentTurn` is present, `MinimalResponseOverlay` converts that projection
  into overlay-ready current-turn messages and entries
- SDK live-turn presentation rows are converted with `buildCurrentTurnMessagesFromPresentation(...)`;
  older projection snapshots are converted with `buildCurrentTurnMessagesFromProjection(...)`.
- the response overlay filters those current-turn messages through
  `desktopCurrentTurnMessageRuntime.isVisibleResponseOverlayMessage(...)`
  instead of carrying an inline assistant-message scanner after the latest user
  boundary.
- entry types currently included:
  - `llm-text`
  - `error`
  - `tool-call`
  - `tool-output`
  - `search-source`
  - `tool-explanation`

Selection logic:

1. `useCurrentTurnPresentationState(...)` resolves loop state and latest visible assistant reply for compact/awaiting behavior.
2. `resolveChatPillViewIntent(...)` uses the response-overlay entry list to resolve overlay visibility.
3. `showResponse` is true when current-turn entry list is non-empty and not dismissed, including tool/progress entries.
4. during `preflight` / `awaiting` lifecycle only, a still-mounted prior visible response with the same entry id is treated as stale so the typing indicator can appear immediately for the new turn before the response window's local message store catches up.

Closeability:

- `error` rows are closeable immediately.
- `llm-text` rows are closeable only when `isComplete === true`.
- tool/progress rows (`tool-call`, `tool-output`, `search-source`, and
  `tool-explanation`) are classified by
  `desktopCurrentTurnMessageRuntime.isResponseOverlayProgressMessage(...)` so
  the overlay view model does not own raw row-type groups.

## SDK-Driven View Modes

SDK current-turn channel: `windie:current-turn`.

Phase ownership boundary:

- React chat surfaces do not subscribe to generic `response-overlay-phase`
  changes for runtime state. Renderer send preflight is represented as a
  pending user turn in chat state and over `windie:pending-turn`; this keeps the
  optimistic user row and sending state alive across renderer windows until SDK
  current-turn presentation arrives. The main-process phase channel otherwise
  remains for native window/layout policy and diagnostics.
- `prime-response-overlay-awaiting` is removed. A renderer send no longer asks
  main to force `awaiting-first-chunk`; backend/SDK current-turn projection owns
  active assistant/tool response phases.

Modes:

- `showResponse`:
  - response-overlay entry list for current turn is non-empty (`llm-text`, `error`, and/or `tool-explanation`)
  - entry id is not manually dismissed
- `showAwaitingReply`:
  - no visible response-entry list
  - and current-turn presentation state reports awaiting-reply mode
  - or the only visible response entry is the stale prior-turn response during `preflight` / `awaiting`

Contract ownership:

- SDK owns current-turn runtime meaning: active phase, assistant text,
  reasoning text, tool events, and terminal error state.
- renderer owns only presentation mapping from `currentTurn` into compact overlay
  rows; it must not execute tools, write transcripts, or reinterpret backend
  stream semantics for the overlay.
- pending-turn preflight is presentation-only. It may keep the optimistic user
  row and sending state visible through early SDK startup projections, but it
  must not create transcript rows, execute tools, or become a second completion
  path.
- renderer backend-wire stream handlers are transcript/history side-effect paths.
  They must not suppress, replace, or duplicate live
  assistant/tool row construction and commit the projected turn into message
  history on terminal events.
- `resolveResponseOverlayViewContract(...)` is the canonical pure helper for:
  - latest visible response entry id
  - `showResponse`
  - `showAwaitingReply`
  - overlay layout mode (`hidden` / `awaiting-typing` / `response`)
- `desktopCurrentTurnMessageRuntime` owns response-overlay row classification:
  visible entries, progress entries, source-tagged entries, and closeability.
- `resolveChatPillViewIntent(...)` layers turn-id selection on top of that contract for renderer trace/debug output.
- `useResponseOverlayViewModel(...)` owns the renderer-side composition boundary: current-turn presentation state, response-entry derivation, rendered markdown payloads, closeability, and stale-response suppression during preflight/awaiting.
- `useResponseOverlayWindowSync(...)` owns response-window sizing policy and
  visibility re-report behavior, delegating responsebox size payload assembly,
  IPC, and visibility payload normalization/boolean subscription projection to
  `DesktopResponseOverlayRuntimeClient`.
- `desktopRendererTraceRuntime.ts` owns response-surface stream-trace payload
  field shaping. `useResponseOverlayWindowSync(...)` reports value-level sizing
  and turn inputs to `logRendererResponseSurfaceSizeTrace(...)`; the trace
  runtime maps those values to the existing diagnostic fields.
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
- the response overlay is an independently mounted renderer surface, so
  `AppProvider` must apply the saved appearance theme there too; the indicator
  itself uses dedicated light-mode typing tokens for visible dots and shell.
- `ChatBoxResponse` does not render a separate reasoning/thinking stream region.
- `ChatBoxResponse` sanitizes markdown HTML at the render boundary before
  `dangerouslySetInnerHTML`, even though upstream markdown projection already
  emits sanitized HTML.
- compaction status text alone does not render overlay content unless awaiting/response mode is active.

## Overlay Size IPC Contract

`set-responsebox-size` payloads:

- hidden: `{ visible: false, width: 0, height: 0 }`
- shown: `{ visible: true, width, height, compact_hover }`

Renderer hooks call
`DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues(...)` with
camelCase value fields. The runtime client maps those values to host payload
fields such as `compact_hover`, `turn_ref`, `stale_guard_ref`, and
`dismissed`.

Response overlay hit-test commands use
`DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(...)`.
`MinimalResponseOverlay` reports boolean active state only; the runtime client
assembles the host-shaped `{ active }` IPC payload.

Layout-specific sizing:

- `response` mode reports measured shell width + fixed response frame height
- `awaiting-typing` mode forces `height=24` and reports `compact_hover=true`
- `hidden` mode reports zero size and `visible=false`

Dedupe behavior:

- skips repeated identical size payloads.
- unmount cleanup uses the same hide path while the last visible frame is still
  cached, so a mounted-visible response overlay always reports
  `{ visible: false, width: 0, height: 0 }` before teardown.
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
- `desktopChatSendPreparation` logs SDK screenshot-resource decision
- `ChatBoxResponse` logs the resolved overlay view contract each render pass that matters
- response-window size traces go through
  `logRendererResponseSurfaceSizeTrace(...)`, so the window-sync hook does not
  assemble trace fields such as `layout_mode`, `show_response`,
  `thinking_text_length`, `compact_hover`, `turn_ref`, or `stale_guard_ref`
  directly

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
