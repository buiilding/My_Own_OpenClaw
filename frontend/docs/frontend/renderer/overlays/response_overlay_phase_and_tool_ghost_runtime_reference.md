---
summary: "Deep reference for response overlay renderer behavior: SDK current-turn presentation, local pending-turn handoff, hidden SDK startup projection handoff, closeability rules, and deterministic fixed-frame sizing IPC updates."
read_when:
  - When changing `MinimalResponseOverlay.jsx` rendering logic, overlay utility contracts, or response overlay UX states.
  - When debugging missing response panes, stale awaiting indicators, hidden SDK presentation handoff, local pending-turn flicker, removed `prime-response-overlay-awaiting`, or incorrect response overlay resize behavior.
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
- `frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayInteractionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js`
- `frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js`
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

- selector-projected `chatSurfaceState` from
  `DesktopChatSurfaceSelectorRuntime`
- SDK `ConversationView` live turn when available
- renderer `pendingTurn` only as the pre-SDK-open bridge

Current-turn entry construction:

- when SDK `currentTurn` is present, `MinimalResponseOverlay` converts that projection
  into overlay-ready current-turn messages and entries
- SDK live-turn rows are converted through
  `DesktopCurrentTurnMessageRuntime.buildSdkLiveTurnMessages(...)`, so the
  response overlay does not independently choose between `ConversationView`,
  presentation entries, and older no-presentation projection snapshots.
- under `ConversationView`, response-overlay entries start with active-turn
  `displayRows` converted through the SDK display-row projection, then append
  only live-turn rows whose source/type has not materialized in those display
  rows. The overlay must not depend only on `liveTurn.entries`, because
  materialized tool rows are intentionally removed from live entries to avoid
  duplicate dashboard cards.
- the response overlay filters those current-turn messages through
  `DesktopCurrentTurnMessageRuntime.isVisibleResponseOverlayMessage(...)`
  instead of carrying an inline assistant-message scanner after the latest user
  boundary.
- entry types currently included:
  - `llm-text`
  - `error`
  - `tool-call`
  - `tool-output`
  - `search-source`
  - `tool-explanation`

Reasoning copy for overlay window sync comes from SDK presentation thinking
entries, with the legacy no-view reasoning fallback resolved inside
`DesktopCurrentTurnMessageRuntime.resolveNoViewSdkLiveTurnThinkingText(...)`.
Store `thinkingStatus` remains dashboard compaction/manual status text and is
not a response-overlay live-turn input.

Selection logic:

1. `DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` owns
   awaiting/active/terminal lifecycle for the overlay.
2. `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
   provides message/response fields directly to the overlay view model, while
   SDK presentation snapshots provide response-entry and overlay-intent data
   only.
3. `DesktopChatPillSessionRuntime.resolveChatPillViewIntent(...)` uses the response-overlay entry list to resolve overlay visibility.
4. `responseVisible` is true when current-turn entry list is non-empty and not dismissed, including tool/progress entries.
5. during `local_pending` / `awaiting` lifecycle only, a still-mounted prior visible response with the same entry id is treated as stale so the typing indicator can appear immediately for the new turn before the response window's local message store catches up.
6. phase-only SDK projections with no visible text, entries, tool/search
   progress, error, or renderer pending turn are not typing authority.

Closeability:

- `error` rows are closeable immediately.
- `llm-text` rows are closeable only when `isComplete === true`.
- tool/progress rows (`tool-call`, `tool-output`, `search-source`, and
  `tool-explanation`) are classified by
  `DesktopCurrentTurnMessageRuntime.isResponseOverlayProgressMessage(...)` so
  the overlay view model does not own raw row-type groups.

## SDK-Driven View Modes

SDK current-turn channel: `windie:current-turn`.

Phase ownership boundary:

- `DesktopLiveTurnSurfaceRuntime` owns live current-turn surface input and SDK
  overlay-intent fallback projection for chat and response-overlay surfaces;
  feature hooks consume that facade instead of importing standalone live-turn
  helpers. Its phase, busy, awaiting, and response flags are mapped from
  `DesktopVisibleTurnLifecycleRuntime`; SDK overlay intent remains rendering
  metadata for refs, stale guards, dismissal, and trace context.
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

- `responseVisible`:
  - response-overlay entry list for current turn is non-empty (`llm-text`, `error`, and/or `tool-explanation`)
  - entry id is not manually dismissed
- `awaitingVisible`:
  - no visible response-entry list
  - and current-turn presentation state reports awaiting-reply mode
  - or the only visible response entry is the stale prior-turn response during `preflight` / `awaiting`

Contract ownership:

- SDK owns current-turn runtime meaning: active phase, assistant text,
  reasoning text, tool events, and terminal error state.
- renderer owns only presentation mapping from `currentTurn` into compact overlay
  rows; it must not execute tools, write transcripts, or reinterpret backend
  stream semantics for the overlay.
- local pending-turn handoff is presentation-only. It may keep the optimistic user
  row and sending state visible through early SDK startup projections, but it
  must not create transcript rows, execute tools, or become a second completion
  path.
- renderer transcript/history side-effect handlers consume SDK conversation
  events after the SDK current-turn projection. They must not suppress, replace,
  or duplicate live assistant/tool row construction, and may only commit the
  projected turn into message history on terminal events.
- `DesktopResponseOverlayViewRuntime.resolveResponseOverlayViewContract(...)`
  is the canonical pure helper for:
  - latest visible response entry id
  - `responseVisible`
  - `awaitingVisible`
  - overlay layout mode (`hidden` / `awaiting-typing` / `response`)
- `DesktopCurrentTurnMessageRuntime` owns response-overlay row classification:
  visible entries, progress entries, source-tagged entries, closeability, and
  SDK current-turn projection-to-message conversion behind one renderer
  app-runtime facade.
- `DesktopChatPillSessionRuntime.resolveChatPillViewIntent(...)` layers turn-id selection on top of that contract for renderer trace/debug output.
- `useResponseOverlayViewModel` names the selected rows as
  `responseOverlayMessages`; feature code should not reintroduce a
  caller-built `currentTurnMessages` read model beside
  `DesktopResponseOverlayViewRuntime.resolveResponseOverlayEntries(...)`.
- `DesktopCurrentTurnPresentationRuntime.resolveSdkResponseOverlayPresentationState(...)`
  returns explicit SDK response-entry data and overlay-intent metadata without
  merging a caller-supplied presentation fallback; response visibility requires
  an actual response entry, and lifecycle, awaiting, busy, and typing fields
  are stamped by `DesktopVisibleTurnLifecycleRuntime` after that data step.
- `DesktopVisibleTurnLifecycleRuntime.shouldUseLocalPendingTurn(...)` owns
  hidden SDK startup and terminal handoff rules used by live-surface
  projection. `DesktopLiveTurnSurfaceRuntime` maps the resolved visible
  lifecycle into overlay-compatible phase, busy, awaiting, and response fields;
  SDK overlay intent remains metadata for turn refs, stale guards, dismissal,
  and trace context rather than lifecycle authority.
- `DesktopCurrentTurnPresentationRuntime.resolveResponseOverlayDismissalTarget(...)`
  owns the dismissal target projection from SDK overlay intent, current-turn
  refs, latest response entry id, and stale guard ref.
- `DesktopResponseOverlayViewRuntime.buildResponseOverlayDismissalKey(...)`
  owns normalized response-overlay dismissal key construction, and
  `DesktopResponseOverlayViewRuntime.buildDismissResponseOverlayAction(...)`
  builds the store dismissal target plus responsebox hide values for manual
  close actions. `chatStore.ts` persists dismissed keys, but it does not define
  the conversation/turn/entry key contract.
- `DesktopResponseOverlayViewRuntime.resolveResponseOverlayEntries(...)` owns
  response-entry derivation across SDK `ConversationView.liveTurn`, SDK
  current-turn presentation rows, raw SDK live-turn fallback rows, and local
  pending suppression.
- `DesktopResponseOverlayViewRuntime.resolveResponseOverlayPresentationState(...)`
  owns response-overlay presentation-state source selection across SDK
  projection rows, SDK `ConversationView.liveTurn`, local pending overlay
  intent, and visible lifecycle stamping. `useResponseOverlayViewModel(...)`
  owns the renderer-side composition boundary for rendered markdown payloads,
  closeability, and stale-response suppression during local-pending/awaiting.
- `DesktopResponseOverlayViewRuntime.resolveResponseOverlayWindowGuardSnapshot(...)`
  and `resolveResponseOverlayWindowSizeIdentity(...)` own response-window
  conversation, turn, and stale-guard fallback resolution from SDK overlay
  intent plus the last valid guard snapshot. The same runtime builds
  response-window size trace values, responsebox size values, and lifecycle
  trace values from that identity, so the hook does not unpack turn or guard
  fields itself.
- `useResponseOverlayWindowSync(...)` owns response-window sizing policy and
  visibility re-report behavior. It passes value-level visibility, layout,
  frame size, and runtime identity into `DesktopResponseOverlayViewRuntime`,
  then delegates IPC and visibility payload normalization/boolean subscription
  projection to `DesktopResponseOverlayRuntimeClient`.
- `DesktopResponseOverlayInteractionRuntime` owns the browser scheduling behind
  response-window visibility re-reporting and visible size updates:
  animation-frame scheduling, retry timer scheduling, `ResizeObserver`, and
  cleanup. `useResponseOverlayWindowSync(...)` supplies value-level callbacks
  and refs.
- `DesktopRendererTraceRuntime` owns response-surface stream-trace and
  live-surface size-report payload field shaping.
  `useResponseOverlayWindowSync(...)` reports
  `DesktopResponseOverlayViewRuntime`-built sizing trace values to
  `logRendererResponseSurfaceSizeTrace(...)`; the trace runtime maps those
  values to the existing stream diagnostic fields and live
  `response_overlay.renderer.size_report` event fields.
- `DesktopRendererTraceRuntime` owns response overlay mount/unmount
  live-surface event labels and payload shaping through
  `logRendererResponseOverlayLifecycleTrace(...)`; the window-sync hook reports
  `DesktopResponseOverlayViewRuntime`-built lifecycle trace values.
- `DesktopRendererTraceRuntime` owns response overlay hit-test and
  rendered-typing live-surface event labels, reason strings, and payload field
  shaping through `logRendererResponseOverlayHitTestTrace(...)` and
  `logRendererResponseOverlayTypingRenderedTrace(...)`; it also derives trace
  conversation identity from opaque SDK overlay intent. `MinimalResponseOverlay`
  reports only interaction state, rendered state, and the overlay intent object.
- `DesktopRendererTraceRuntime` owns response overlay response-surface
  snapshot stream-trace field shaping through
  `logRendererResponseSurfaceSnapshotTrace(...)`; `MinimalResponseOverlay`
  reports only phase, message-count, response-entry, visible-response, and
  text-length values.
- `DesktopResponseOverlayViewRuntime` owns response overlay state/snapshot/render
  trace summary and signature construction. `MinimalResponseOverlay` passes
  value-level view model fields to `buildResponseOverlayTraceSummary(...)` and
  logs the returned trace inputs instead of recomputing turn ids, text lengths,
  or JSON state signatures inline.
- `DesktopResponseOverlayViewRuntime` owns response overlay latest source-tagged
  entry selection, entry signature construction, and closeability checks.
  `useResponseOverlayViewModel(...)` passes entry lists and visibility/busy
  booleans to the runtime instead of importing current-turn message classifiers.
- `DesktopRendererTraceRuntime` also owns response overlay view-model
  live-surface trace payload, signature construction, resolved-event,
  typing-event, intent-event, and reason mapping.
  `useResponseOverlayViewModel(...)` reports value-level SDK, presentation, and
  view-intent inputs, then logs the app-runtime-built trace records when the
  resolved payload, typing visibility, or overlay intent mode changes. Trace
  identity follows the resolved visible lifecycle first, then overlay
  intent/current-turn/pending fallback fields only when no visible lifecycle
  identity exists.
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

Manual response dismissal uses
`DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox(...)` so the view
model passes app-runtime-built responsebox dismissal values while the runtime
client owns the hidden `dismissed` size payload shape.

Response overlay hit-test browser subscriptions and pointer bounds checks use
`DesktopResponseOverlayInteractionRuntime.subscribeToResponseboxHitTestEvents(...)`.
`MinimalResponseOverlay` reports boolean active state only, and
`DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(...)`
assembles the host-shaped `{ active }` IPC payload.

Response overlay size re-report and resize scheduling use
`DesktopResponseOverlayInteractionRuntime.scheduleResponseOverlayFrame(...)`
and `DesktopResponseOverlayInteractionRuntime.startResponseOverlaySizeUpdateSync(...)`.
`useResponseOverlayWindowSync(...)` remains the owner for hidden/shown sizing
policy and responsebox size IPC calls; `DesktopResponseOverlayViewRuntime`
owns turn guard metadata fallback resolution and identity-bearing size value
assembly before those calls.

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
  - `response_visible`
  - `awaiting_visible`
- `useChatMessageSender` logs send start and backend dispatch intent
- `desktopChatSendPreparation` logs SDK screenshot-resource decision
- `ChatBoxResponse` logs the resolved overlay view contract each render pass that matters
- response-window size traces go through
  `logRendererResponseSurfaceSizeTrace(...)`, so the window-sync hook does not
  assemble trace fields such as `layout_mode`, `response_visible`,
  `thinking_text_length`, `compact_hover`, `turn_ref`, `stale_guard_ref`,
  `thinkingTextLength`, `overlayMode`, `guardRef`, or the
  `response_overlay.renderer.size_report` event name directly
- response overlay mount/unmount traces go through
  `logRendererResponseOverlayLifecycleTrace(...)`, so the window-sync hook does
  not assemble `renderer.response_overlay.mount` or
  `renderer.response_overlay.unmount` event names locally
- response overlay hit-test and rendered-typing traces go through
  `logRendererResponseOverlayHitTestTrace(...)` and
  `logRendererResponseOverlayTypingRenderedTrace(...)`, so
  `MinimalResponseOverlay` does not assemble `response_overlay.hit_test.set`,
  `typing.rendered.show`, `typing.rendered.hide`, rendered-typing reason
  strings, or `ignoreMouseEvents` fields locally
- response-surface snapshot stream traces go through
  `logRendererResponseSurfaceSnapshotTrace(...)`, so
  `MinimalResponseOverlay` does not call `logRendererResponseSurfaceTrace(...)`
  or assemble snapshot fields such as `overlayPhase` and `activeResponseType`
  locally
- response overlay view-model traces go through
  `buildRendererOverlayViewModelTracePayload(...)`,
  `logRendererOverlayViewModelResolvedTrace(...)`,
  `buildRendererOverlayTypingTraceEvent(...)`, and
  `buildRendererOverlayIntentTraceEvent(...)`, so the overlay view-model hook
  does not assemble live-surface trace event names, reason strings, or payload
  field names locally

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
