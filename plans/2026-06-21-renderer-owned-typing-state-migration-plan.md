---
summary: "Migration plan for implementing ADR 006 renderer-owned typing state, converging dashboard, pill, overlay, Stop/busy, and awaiting UI onto one visible turn lifecycle projection while deleting legacy lifecycle authorities."
title: "Renderer-Owned Typing State Migration Plan"
---

# Renderer-Owned Typing State Migration Plan

Date: 2026-06-21

## Progress Notes

### 2026-06-22 Completion Audit

- Evidence: `DesktopVisibleTurnLifecycleRuntime` owns visible lifecycle and
  pending-turn handoff; chat surface, response overlay, live surface, Stop, and
  chat-store pending clearing route through that owner.
- Evidence: production scans show remaining raw `isSending`, `streamTracking`,
  and `thinkingStatus` reads are store state, transport guards, trace identity,
  or dashboard compaction/reasoning rendering data rather than surface
  lifecycle authorities.
- Evidence: Core Loop Regression Pack and `scripts/windie/commands.cjs`
  include the visible lifecycle, projection effects, live surface, dashboard,
  response overlay, pending-turn, pending-stop, and stop-runtime suites.
- Completion: ADR 006 renderer-owned typing state migration is implemented for
  the renderer desktop lifecycle boundary. No persisted transcript, SDK event
  payload, IPC payload, renderer config storage, permission, credential, local
  execution, trust-boundary, or storage migration required.

### 2026-06-22 SDK Visible Content Flag Authority Deletion

- Finding: visible lifecycle, live-surface overlay metadata, stopped-turn
  projection, and current-turn projection side effects still treated SDK
  `presentation.hasVisibleContent` as visible response evidence even when no
  SDK presentation entries, text, errors, or tool events were present.
- Change: removed `hasVisibleContent` from lifecycle, stopped-turn overlay, and
  send-latch authority. Renderer surfaces now require concrete entries,
  assistant/reasoning/error text, terminal phase, or tool progress/call/output
  evidence; response-overlay presentation state marks visible replies from
  actual entries only and stopped projections strip the legacy SDK flag.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `DesktopCurrentTurnProjectionEffectsRuntime.test.ts`,
  `LiveTurnSurfaceState.test.js`, `ChatboxSurfaceState.test.js`, and
  `DesktopStopTurnRuntime.test.js`, plus app/chat runtime boundary tests,
  protect flag-only projections as non-authoritative.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Local Pending Surface Predicate Deletion

- Finding: `DesktopVisibleTurnLifecycleRuntime` still exported
  `shouldUseLocalPendingTurn(...)` only for live-surface callers, preserving a
  second public handoff facade after `resolveVisibleTurnLifecycle(...)` already
  returned the authoritative `local_pending` status.
- Change: removed the extra predicate export and made
  `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)` derive
  pending-turn overlay state directly from the resolved visible lifecycle
  status.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `LiveTurnSurfaceState.test.js`, and `RendererAppRuntimeBoundary.test.ts`
  protect the single lifecycle-status handoff path and reject the retired
  predicate in both visible lifecycle and live-surface runtimes.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Overlay Intent Mode Authority Deletion

- Finding: `DesktopLiveTurnSurfaceRuntime.hasSdkLiveTurnPresentation(...)`
  still accepted an SDK `presentation.overlayIntent.mode` object as proof that
  SDK live presentation existed, and copied SDK overlay-intent mode through to
  overlay metadata even though ADR 006 treats overlay intent mode as a
  non-authority for typing and response lifecycle.
- Change: narrowed SDK live presentation detection to non-empty
  `presentation.entries`, derived overlay-intent metadata mode from SDK phase
  plus visible content/progress evidence, and kept SDK overlay intent only as a
  source of turn/conversation/stale-guard refs for window sync.
- Validation target: `LiveTurnSurfaceState.test.js`,
  `ChatBoxResponse.state.test.jsx`, and `RendererAppRuntimeBoundary.test.ts`
  protect overlay intent as metadata instead of a lifecycle authority.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Retired Overlay Lifecycle Scrubber Deletion

- Finding: `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
  still cloned presentation state through a compatibility scrubber whose only
  purpose was deleting a retired `overlayTurnLifecycle` field, even though no
  production renderer owner produces that field anymore.
- Change: removed the scrubber and its legacy-field unit fixture, and tightened
  renderer boundary coverage so the visible lifecycle runtime cannot reintroduce
  the retired overlay lifecycle name.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js` and
  `RendererAppRuntimeBoundary.test.ts` protect the presentation stamping
  contract without preserving a legacy payload adapter.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Dashboard Thread Tool-Log Input Deletion

- Finding: `ChatInterface` still read `config.show_tool_logs` and passed
  `showToolLogs` plus `isBusy` into
  `DesktopThreadPresentationRuntime.buildThreadPresentationMessages(...)`,
  even though the thread presenter no longer consumed either value and visible
  lifecycle already owns busy/typing state.
- Change: removed the unused dashboard thread projection inputs, kept durable
  and SDK current-turn rows as rendering data, and updated tests/docs to state
  that tool-log toggles do not drive thread row projection or typing lifecycle.
- Validation target: `ChatInterfaceWiring.test.jsx`,
  `MessagePresentationPipeline.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed thread presentation
  boundary.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Live Surface Send-Preflight Predicate Deletion

- Finding: the visible lifecycle owner still exported the local pending-turn
  handoff predicate as `shouldUseLocalSendPreflight(...)`, and the live-surface
  adapter kept a `shouldUseSendPreflight(...)` wrapper plus a `send-preflight`
  source fallback even though renderer `pendingTurn` is now the required
  evidence for local typing.
- Change: renamed the owner predicate to `shouldUseLocalPendingTurn(...)`,
  deleted the live-surface wrapper and source fallback, and kept live-surface
  local awaiting output on the explicit `pending-turn` source.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `LiveTurnSurfaceState.test.js`, and `RendererAppRuntimeBoundary.test.ts`
  protect the pending-turn handoff contract and reject the retired preflight
  source path.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Live Surface Local Pending Alias Deletion

- Finding: `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)`
  still exposed the renderer-local pending path as `useLocalSendLatch`, and
  response-overlay traces forwarded that legacy send-latch name even though the
  value is now derived from accepted renderer `pendingTurn` plus visible
  lifecycle handoff rules.
- Change: renamed the live-surface and overlay trace boundary to
  `useLocalPendingTurn`, changed local awaiting trace reasons to
  `local-pending-awaiting`, and added renderer boundary coverage rejecting the
  old `useLocalSendLatch` field.
- Validation target: `LiveTurnSurfaceState.test.js`,
  `DesktopRendererTraceRuntime.test.ts`, and
  `RendererAppRuntimeBoundary.test.ts` protect the pending-turn projection and
  trace contract without preserving the send-latch alias.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Minimal Pill Stop Test Send Latch Deletion

- Finding: `ChatBoxOverlayMouseIgnore.test.jsx` still described the
  pre-first-stream Stop affordance as `isSending=true`, preserving a test-only
  raw send-latch authority after `MinimalChatPill` production code had moved
  Stop rendering to `pendingTurn` plus renderer-owned visible lifecycle.
- Change: removed the raw `isSending` fixture and renamed the replay around
  pending-turn Stop before the first stream event. Renderer boundary coverage
  now rejects reintroducing `mockChatState.isSending` in that minimal-pill
  integration test.
- Validation target: `ChatBoxOverlayMouseIgnore.test.jsx` and
  `RendererAppRuntimeBoundary.test.ts` protect the pending-turn Stop path
  without preserving raw send-latch test authority.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Response Overlay View Intent Alias Deletion

- Finding: `DesktopResponseOverlayViewRuntime.resolveResponseOverlayViewContract(...)`,
  `DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayLayoutMode(...)`,
  and minimal response-overlay consumers still exposed `showResponse` and
  `showAwaitingReply` as view-intent booleans after response visibility and
  awaiting visibility were owned by explicit response entries plus
  `visibleTurnLifecycle.status`.
- Change: renamed the view and layout contract to `responseVisible` and
  `awaitingVisible`. Minimal response-overlay hooks, component rendering, and
  renderer trace builders now consume the explicit visibility fields instead of
  the legacy `show*` aliases.
- Validation target: `ResponseOverlayViewContract.test.ts`,
  `ChatPillSessionFlow.test.ts`, `ResponseOverlayLayoutMode.test.js`,
  `DesktopRendererTraceRuntime.test.ts`, and renderer boundary tests protect
  the trimmed response-overlay view contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 SDK Response Overlay Fallback State Deletion

- Finding: `DesktopCurrentTurnPresentationRuntime.resolveSdkResponseOverlayPresentationState(...)`
  still accepted `fallbackState` and merged it into SDK response-overlay
  projection, preserving a legacy adapter path after message-only presentation
  and visible lifecycle stamping had become separate owner steps.
- Change: removed the fallback parameter. SDK response-overlay projection now
  returns explicit SDK response-entry data and overlay-intent metadata only;
  `useResponseOverlayViewModel(...)` composes that data before visible lifecycle
  stamping instead of asking the helper to merge a fallback presentation
  snapshot.
- Validation target: `ChatboxSurfaceState.test.js` and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed response overlay
  presentation contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Live Surface Response Alias Deletion

- Finding: `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)`
  still returned `showResponse`, a duplicate response-visibility boolean after
  response-overlay visibility moved to the view intent that combines visible
  entries and dismissal state.
- Change: removed `showResponse` from live-turn surface output. Focused tests
  now assert phase, busy state, source handoff, and SDK presentation data while
  a boundary test rejects reintroducing the alias in the live-surface runtime.
- Validation target: `LiveTurnSurfaceState.test.js`,
  `PendingTurnLiveSurfaceIntegration.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed live-surface
  contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Live Surface Awaiting Alias Deletion

- Finding: `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)`
  still returned `showAwaiting`, a duplicate typing boolean after the visible
  lifecycle owner already exposed `showTyping` and production overlay/chat
  surfaces no longer consumed the live-surface alias.
- Change: removed `showAwaiting` from live-turn surface output. Focused tests
  now assert phase, busy state, source handoff, and response visibility while a
  boundary test rejects reintroducing the alias in the live-surface runtime.
- Validation target: `LiveTurnSurfaceState.test.js`,
  `PendingTurnLiveSurfaceIntegration.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed live-surface
  contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Response Overlay Awaiting Layout Helper Deletion

- Finding: `DesktopResponseOverlayLayoutRuntime` still exported
  `isAwaitingResponseOverlayLayoutMode(...)`, a public awaiting-mode predicate
  after compact-hover layout mode and native mode resolution already encoded the
  only remaining response-overlay sizing/native behavior.
- Change: removed the awaiting-layout helper export. Window sync now sizes the
  typing frame from `isCompactHoverLayoutMode(...)`, and native mode resolution
  stays inside the layout runtime.
- Validation target: `ResponseOverlayLayoutMode.test.js` and
  `RendererChatRuntimeBoundary.test.ts` protect the trimmed layout facade.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Chatbox Response Boolean Deletion

- Finding: current-turn presentation still returned `showChatboxResponse`, a
  duplicate boolean after response-overlay view intent moved to overlay entries
  and chatbox presentation already carried the `chatboxSurfaceState` enum.
- Change: removed `showChatboxResponse` from message-only presentation, SDK
  response-overlay projection, and visible-lifecycle stamping. Tests now assert
  `chatboxSurfaceState` and visible response data directly.
- Validation target: `ChatboxSurfaceState.test.js`,
  `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatSurfaceController.test.jsx`, and `RendererAppRuntimeBoundary.test.ts`
  protect the trimmed presentation contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Chatbox Awaiting Boolean Deletion

- Finding: current-turn presentation still stamped
  `showChatboxAwaitingReply`, a duplicate awaiting boolean after response
  overlay view intent could read `visibleTurnLifecycle.status` directly.
- Change: removed `showChatboxAwaitingReply` from message-only presentation,
  visible-lifecycle stamping, chat-pill session typing, and response-overlay
  view contract inputs. Awaiting overlay visibility now derives from
  `local_pending` or `awaiting` lifecycle status.
- Validation target: `ChatboxSurfaceState.test.js`,
  `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatSurfaceController.test.jsx`, `ChatPillSessionFlow.test.ts`,
  `ResponseOverlayViewContract.test.ts`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Presentation Loop UI State Alias Deletion

- Finding: current-turn presentation still stamped `loopUiState`, a stale
  chatbox-era alias after transport recovery moved to `useChatLoopUiState(...)`
  and desktop typing/awaiting state moved to `visibleTurnLifecycle.status`,
  and `chatboxSurfaceState`.
- Change: removed the presentation-level `loopUiState` field from
  message-only current-turn presentation and visible lifecycle stamping while
  leaving the real chat-loop transport hook untouched.
- Validation target: `ChatboxSurfaceState.test.js`,
  `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatSurfaceController.test.jsx`, and `LatestVisibleAssistantReply.test.js`
  protect the trimmed presentation contract and the remaining visible
  lifecycle fields.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Awaiting Reply Alias Deletion

- Finding: message-only current-turn presentation and visible-lifecycle
  stamping still carried `isAwaitingReply`, a duplicate boolean after
  production consumers had moved to `visibleTurnLifecycle.status`,
  `chatboxSurfaceState`, and the concrete `awaitingDotTargetMessageId` anchor.
- Change: removed `isAwaitingReply` from the presentation snapshot and visible
  lifecycle adapter, and added boundary coverage so the legacy alias is not
  reintroduced in the current-turn or visible-lifecycle runtimes.
- Validation target: `ChatboxSurfaceState.test.js`,
  `DesktopVisibleTurnLifecycleRuntime.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed presentation
  contract.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Assistant Awaiting Dot Boolean Deletion

- Finding: `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
  still stamped `showAssistantAwaitingDot`, a duplicate dashboard boolean after
  production rendering had moved to the concrete
  `awaitingDotTargetMessageId` anchor from the visible lifecycle.
- Change: removed `showAssistantAwaitingDot` from message-only presentation,
  visible-lifecycle stamping, and response-overlay trace inputs. Traces now
  derive `showAwaitingDot` from the presence of an awaiting target id.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatSurfaceController.test.jsx`, `DesktopRendererTraceRuntime.test.ts`,
  `ChatboxSurfaceState.test.js`, `LatestVisibleAssistantReply.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed presentation
  contract while keeping dashboard awaiting placement on
  `awaitingDotTargetMessageId`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Chat Interface Stream Tracking Selector Deletion

- Finding: `DesktopChatSurfaceSelectorRuntime.projectDesktopChatInterfaceState(...)`
  still forwarded raw `streamTracking` into the dashboard selector result even
  though `ChatInterface` no longer reads stream phase for typing, busy, Stop, or
  row projection.
- Change: removed `streamTracking` from the chat-interface selector projection
  while keeping it in the store for transport diagnostics and focused stream
  runtime tests.
- Validation target: `ChatSelectors.test.js` and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed selector contract and
  keep raw stream phase out of the app-runtime surface projection.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Response Overlay Reasoning Text Helper Deletion

- Finding: `DesktopCurrentTurnMessageRuntime` still exported
  `normalizeThinkingText(...)`, a legacy-named helper with a `thinkingStatus`
  parameter even though response overlay reasoning copy now comes from SDK
  `currentTurn.reasoningText` and store `thinkingStatus` is dashboard-only
  compaction/manual status text.
- Change: deleted the message-runtime helper export and moved the trivial
  reasoning-text normalization into `useResponseOverlayViewModel(...)` beside
  the SDK reasoning input it normalizes.
- Validation target: `ChatBoxResponseState.test.js` and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed message-runtime
  surface while response-overlay tests continue to cover SDK reasoning text
  rendering.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Pending Stop Visible Lifecycle Regression

- Finding: `PendingStopLiveSurfaceIntegration.test.jsx` still wired the shared
  stop hook with raw store `isSending`, preserving a test-only stop affordance
  authority after production Stop routing had moved to visible lifecycle busy
  state.
- Change: the pending-stop replay now derives stop enablement through
  `useChatSurfaceController(...)` and explicitly forces raw `isSending=false`
  after accepting a pending turn, proving renderer `pendingTurn` plus visible
  lifecycle still stops and clears the correct turn.
- Validation target: `PendingStopLiveSurfaceIntegration.test.jsx` remains in
  `<windie> test core-loop` and protects pending Stop from regressing to a raw
  send-latch gate.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Current-Turn Presentation Hook Deletion

- Finding: `useCurrentTurnPresentationState(...)` had become a feature-level
  compatibility shim that only memoized calls into
  `DesktopCurrentTurnPresentationRuntime`, while lifecycle stamping already
  belonged to `DesktopVisibleTurnLifecycleRuntime`.
- Change: deleted the hook and its dedicated hook test. `useChatSurfaceController`
  and `useResponseOverlayViewModel` now call
  `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
  directly for message/response data before applying renderer-owned visible
  lifecycle state.
- Validation target: `ChatSurfaceController.test.jsx`,
  `ChatBoxResponse.state.test.jsx`, and `RendererAppRuntimeBoundary.test.ts`
  protect direct app-runtime presentation projection and keep the removed hook
  from returning.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Current-Turn Projection Cursor Visibility Field Deletion

- Finding: `DesktopCurrentTurnProjectionEffectsRuntime` still stored a
  `typingVisible` field in its projection cursor even though the value was
  only a restatement of `phase === 'awaiting'` and no consumer read it.
- Change: the projection side-effect cursor now tracks only text lengths,
  phase, terminal error text, and seen tool-event ids. Test fixtures preserve
  SDK `presentation.typingVisible` only in the explicit negative case proving
  that SDK visibility flags do not drive the send latch.
- Validation target: `DesktopCurrentTurnProjectionEffectsRuntime.test.ts` and
  `RendererChatRuntimeBoundary.test.ts` protect the trimmed cursor and reject
  SDK presentation visibility fields in the side-effect runtime.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-22 Chat Provider Context And Trace Latch Deletion

- Finding: `ChatProvider` still wrapped children in an empty `ChatContext`
  compatibility provider with no consumers, and provider-injected live-surface
  trace snapshots still exposed raw `isSending`, `thinkingStatus`, and
  `streamTracking.phase` fields after visible lifecycle had become the desktop
  surface authority.
- Change: deleted `ChatContext.jsx`, made `ChatProvider` return children
  directly after mounting setup hooks, and restricted trace workspace snapshots
  to conversation/message identity evidence.
- Validation target: `ChatProvider.test.jsx`, `DesktopRendererTraceRuntime.test.ts`,
  `RendererAppRuntimeBoundary.test.ts`, and `RendererChatRuntimeBoundary.test.ts`
  protect provider setup behavior, deleted context compatibility, and trimmed
  trace lifecycle payloads.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Minimal Surface Trace Send Latch Deletion

- Finding: after lifecycle consumers stopped reading raw `isSending`, both
  `MinimalChatPill` and `MinimalResponseOverlay` still subscribed to the store
  send latch only to include it in diagnostic trace payloads, preserving a
  trace-only compatibility exception at the live surface boundary.
- Change: minimal surface state and response snapshot traces no longer accept
  or emit raw send-latch fields, and the components no longer subscribe to
  `state.isSending` outside the renderer-owned visible lifecycle.
- Validation target: `DesktopRendererTraceRuntime.test.ts` and
  `RendererAppRuntimeBoundary.test.ts` protect the trimmed payloads and surface
  source boundaries.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Stop Projection SDK Visibility Flag Deletion

- Finding: `DesktopStopTurnRuntime.buildStoppedCurrentTurnProjection(...)`
  still copied or restamped SDK `presentation.typingVisible` and
  `presentation.overlayVisible` when terminalizing a stopped current turn,
  preserving legacy visibility fields after the renderer visible lifecycle had
  already become the post-stop typing/visibility authority.
- Change: stopped current-turn projections now strip those SDK visibility
  compatibility fields while preserving visible entries and overlay-intent
  metadata for response rendering and dismissal.
- Validation target: `DesktopStopTurnRuntime.test.js`, `ChatStore.test.ts`,
  and `RendererChatRuntimeBoundary.test.ts` protect stopped projection
  terminalization without SDK visibility flags.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Response Overlay Thinking Status Fallback Deletion

- Finding: `selectLiveTurnSurfaceState(...)`, `MinimalResponseOverlay`, and
  `useResponseOverlayViewModel(...)` still threaded store `thinkingStatus` into
  response overlay window sync as a fallback when SDK `currentTurn.reasoningText`
  was absent, preserving a stale live-turn text compatibility path outside the
  renderer-owned lifecycle projection.
- Change: live-turn surface selection no longer exposes `thinkingStatus` or
  `thinkingSourceEventType`; response overlay reasoning text is derived only
  from SDK `currentTurn.reasoningText`. Dashboard compaction/manual status
  display remains on the chat-interface `MessageList` path.
- Validation target: `ChatSelectors.test.js`, `ChatBoxResponse.state.test.jsx`,
  and `RendererAppRuntimeBoundary.test.ts` protect the trimmed selector and
  response-overlay hook boundary.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Current-Turn Trace SDK Visibility Flag Removal

- Finding: `DesktopRendererTraceRuntime.buildRendererCurrentTurnAppliedTracePayload(...)`
  still copied SDK `presentation.typingVisible` and `presentation.overlayVisible`
  into current-turn live-surface traces after renderer lifecycle consumers had
  stopped using those fields as authority.
- Change: current-turn applied trace payloads now report phase, overlay intent
  metadata, visible-content evidence, entry counts, text lengths, tool event
  count, and stale-side-effect suppression without preserving SDK presentation
  visibility booleans.
- Validation target: `DesktopRendererTraceRuntime.test.ts` protects the trimmed
  payload shape while lifecycle tests continue to cover visible-lifecycle
  authority.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Overlay Lifecycle Runtime Deletion

- Finding: after visible lifecycle stopped stamping `overlayTurnLifecycle`, the
  JSON-backed `DesktopOverlayTurnLifecycleRuntime` had no production consumers;
  only its dedicated test and documentation still kept the legacy
  preflight/awaiting/active/terminal overlay lifecycle contract alive.
- Change: deleted `desktopOverlayTurnLifecycleRuntime.js`,
  `overlay_turn_lifecycle_contract.json`, and `OverlayTurnLifecycle.test.js`.
  Boundary tests now assert those files stay removed, and renderer docs route
  stale overlay lifecycle searches to `DesktopVisibleTurnLifecycleRuntime`.
- Validation target: `RendererAppRuntimeBoundary.test.ts`,
  `DesktopVisibleTurnLifecycleRuntime.test.js`, `ChatLoopUiState.test.js`,
  and response-overlay focused tests protect visible lifecycle and transport
  recovery without the old overlay lifecycle facade.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Visible Lifecycle Overlay Field Deletion

- Finding: after response overlay view logic moved to
  `visibleTurnLifecycle.status`, `applyVisibleTurnLifecycleToPresentationState(...)`
  still imported the overlay lifecycle runtime to stamp a legacy
  `overlayTurnLifecycle` field, and response overlay traces/tests continued to
  preserve that compatibility field.
- Change: the visible lifecycle presentation adapter now strips incoming
  `overlayTurnLifecycle` data and does not restamp it; response overlay traces
  no longer emit the legacy field, and tests assert visible lifecycle status
  plus busy/awaiting fields instead.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatboxSurfaceState.test.js`, and `DesktopRendererTraceRuntime.test.ts`
  protect the deleted field while preserving response-entry rendering and
  trace payload behavior.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Visible Lifecycle Presentation Facade Removal

- Finding: `DesktopVisibleTurnLifecycleRuntime` still exported
  `resolveVisibleTurnLifecycleForPresentation(...)`, a passthrough facade that
  returned the already-resolved visible lifecycle before chat surface and
  response overlay code stamped presentation state.
- Change: chat surface and response overlay now pass the renderer-owned
  `visibleTurnLifecycle` directly into
  `applyVisibleTurnLifecycleToPresentationState(...)`; the passthrough export
  is deleted.
- Validation target: `RendererAppRuntimeBoundary.test.ts` rejects the removed
  facade in the runtime and callers while focused surface tests keep visible
  lifecycle projection behavior covered.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Response Overlay View Legacy Lifecycle Import Removal

- Finding: `DesktopResponseOverlayViewRuntime` still imported
  `DesktopOverlayTurnLifecycleRuntime` and inspected the legacy
  `overlayTurnLifecycle` field to decide whether an old visible response should
  be suppressed during a new awaiting turn.
- Change: response overlay view intent now checks
  `currentTurnPresentationState.visibleTurnLifecycle.status` directly, so the
  stale-response guard reads the renderer-owned lifecycle rather than the
  overlay lifecycle adapter field.
- Validation target: `ResponseOverlayViewContract.test.ts` protects awaiting
  suppression through `local_pending` and active response visibility through
  `active`; `RendererAppRuntimeBoundary.test.ts` rejects the old runtime import.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Live Surface SDK Presentation Visibility Flag Deletion

- Finding: `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)`
  still treated SDK `presentation.typingVisible` and
  `presentation.overlayVisible` as the proof that SDK presentation data existed,
  then rebuilt fallback overlay intent mode from those legacy booleans when
  `presentation.overlayIntent` was absent.
- Change: live-surface presentation recognition now keys off presentation
  entries or an explicit overlay intent object, and fallback overlay intent is
  derived from SDK phase plus visible content/progress evidence. SDK visibility
  booleans are no longer read by the live-surface runtime.
- Validation target: `LiveTurnSurfaceState.test.js` protects presentation
  entries without legacy visibility flags, and
  `RendererAppRuntimeBoundary.test.ts` rejects those fields in the live-surface
  runtime.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Stop Target SDK Busy Fallback Removal

- Finding: `DesktopStopTurnRuntime.resolveStopTurnTarget(...)` still accepted
  SDK `currentTurnProjection.presentation.isBusy=true` as enough to target a
  current turn for Stop, even though Stop button availability is already gated
  by the renderer visible lifecycle and ADR 006 lists SDK presentation busy as
  a non-authority.
- Change: Stop target resolution now chooses SDK current-turn targets only for
  active/stoppable SDK phases, or renderer `pendingTurn` targets for local
  pending sends. Busy-only SDK presentation no longer creates a stoppable turn
  target.
- Validation target: `DesktopStopTurnRuntime.test.js` protects the busy-only
  rejection alongside active SDK phase and pending-turn Stop targeting.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Live Surface Selector Send Alias Removal

- Finding: `selectLiveTurnSurfaceState(...)` still exposed raw `isSending`
  through `DesktopChatSurfaceSelectorRuntime.projectDesktopLiveTurnSurfaceState(...)`
  after production lifecycle consumers had moved to visible lifecycle fields.
  `MinimalResponseOverlay` only used the value for trace payloads, so the
  live-surface selector contract still carried a lifecycle-shaped alias for a
  diagnostic read.
- Change: the live-surface selector no longer returns `isSending`. Response
  overlay reads raw `isSending` directly from the store only for trace payloads,
  matching the minimal pill trace-only pattern while keeping lifecycle and
  hook/view-model inputs on messages, pending turn, and SDK projection data.
- Validation target: `ChatSelectors.test.js` and
  `RendererAppRuntimeBoundary.test.ts` protect the removed selector alias and
  keep surface hooks/view models free of raw send-latch inputs.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Stream Completion Tracking Pending-Turn Gate

- Finding: stream completion handling still let stale raw `isSending=true`
  force another terminal tracking event even when stream phase was already
  `complete` and no matching renderer pending turn remained.
- Change: duplicate completion tracking now goes through
  `DesktopChatStreamEventRuntime.shouldRecordTerminalCompletionTracking(...)`,
  which records when phase is not already complete or the event turn matches
  renderer `pendingTurn.turnRef`. Raw `isSending` and stale thinking copy
  remain compatibility state and no longer drive terminal tracking. SDK
  current-turn projection side effects now run stale-turn checks against the
  pre-storage workspace snapshot so `setCurrentTurnProjection(...)` cannot
  clear pending-turn handoff evidence before the guard runs.
- Validation target: `DesktopChatStreamEventRuntime.test.ts` and
  `RendererChatRuntimeBoundary.test.ts` protect stale raw `isSending`
  suppression, matching pending-turn completion recording, stale thinking-copy
  suppression, the completion hook boundary, and next-turn projection handoff
  after terminal previous-turn state.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Stream Terminal Handoff Pending-Turn Gate

- Finding: `DesktopChatStreamTerminalHandoffRuntime` still used raw
  `isSending=true` with terminal or awaiting-first-chunk stream phases to relax
  stale-turn filtering during next-turn re-anchor, leaving a stale send latch
  able to open a transport handoff window without an accepted renderer pending
  turn.
- Change: terminal and awaiting-first-chunk handoff predicates now require the
  incoming event turn to match renderer `pendingTurn.turnRef`;
  `streamTracking.phase` remains transport state for stale-packet filtering,
  but `isSending` is no longer the proof that a new renderer-owned turn exists,
  and unrelated non-pending turn refs stay filtered.
- Validation target: `DesktopChatStreamTerminalHandoffRuntime.test.ts`,
  `DesktopChatStreamEventRuntime.test.ts`, and
  `RendererChatRuntimeBoundary.test.ts` protect pending-turn re-anchor,
  stale raw `isSending=true` rejection, and the runtime boundary.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Pending-Turn Handoff Resolver Facade

- Finding: `chatStore.ts` still consumed
  `DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSameTurnSdkReplacement(...)`
  directly to clear renderer pending turns, exposing the raw SDK-replacement
  predicate as surface area even though visible lifecycle owns the handoff
  decision.
- Change: `DesktopVisibleTurnLifecycleRuntime` now exposes
  `resolvePendingTurnForCurrentProjection(...)` as the store-facing pending
  handoff contract. The lower-level authoritative SDK projection predicates are
  private to the lifecycle runtime, and `chatStore.ts` receives either the
  preserved pending turn or `null` from that owner.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `ChatStore.test.ts`, and `RendererChatRuntimeBoundary.test.ts` protect the
  resolver behavior, non-authoritative SDK idle preservation, and removed raw
  predicate facade.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Live Surface Send Alias Removal

- Finding: `DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)`
  still returned an `isSending` alias even after production consumers moved to
  visible-lifecycle `isBusy`, awaiting, response, phase, and source fields.
  Focused tests were the only remaining consumers, preserving a misleading
  lifecycle-shaped send-latch field on the live-surface adapter.
- Change: the live-surface adapter no longer emits `isSending`; tests and docs
  now assert `isBusy` and visible lifecycle fields as the surface contract.
- Validation target: `LiveTurnSurfaceState.test.js`,
  `PendingTurnLiveSurfaceIntegration.test.js`, and
  `RendererAppRuntimeBoundary.test.ts` protect the removed alias and pending
  send handoff.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Surface Hook Raw Send Prop Cleanup

- Finding: after pending-turn preflight became the lifecycle authority,
  `ChatInterface`, `MinimalChatPill`, and `MinimalResponseOverlay` still passed
  raw `isSending` into surface hooks/view models that no longer consumed it.
  The full chat-interface selector also exposed `isSending`, preserving a stale
  surface contract even though the dashboard does not render from that raw
  latch.
- Change: `selectChatInterfaceState(...)` now omits `isSending`, and dashboard,
  pill, and response-overlay hook calls pass only messages, pending-turn state,
  SDK current-turn projection, and related presentation inputs. Minimal surface
  components may still read raw `isSending` for trace payloads, where it remains
  diagnostic store compatibility state instead of lifecycle authority.
- Validation target: `ChatSelectors.test.js`, `ChatSurfaceController.test.jsx`,
  `ChatInterfaceWiring.test.jsx`, and `RendererAppRuntimeBoundary.test.ts`
  protect the trimmed selector/hook boundary and retained trace-only reads.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 PendingTurn-Only Preflight Boundary

- Finding: `DesktopVisibleTurnLifecycleRuntime.shouldUseLocalSendPreflight(...)`
  still treated bare `isSending=true` as enough to force local preflight when no
  renderer pending turn existed, and chat surface/response overlay hooks passed
  that raw field into the live-surface adapter.
- Change: local visible-lifecycle preflight now requires a valid
  `pendingTurn`; stale raw `isSending` can remain as store or trace state but
  cannot independently create dashboard, pill, or response-overlay typing.
  `DesktopLiveTurnSurfaceRuntime`, `useChatSurfaceController(...)`, and
  `useResponseOverlayViewModel(...)` no longer consume `isSending` for
  lifecycle handoff.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js`,
  `LiveTurnSurfaceState.test.js`, `ChatSurfaceController.test.jsx`, and
  `ChatBoxResponse.state.test.jsx` assert pending-turn preflight and stale raw
  `isSending` without pending state.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Replay Pending-Turn Handoff

- Finding: conversation retry and edit/resend replay still flipped raw
  `isSending` before SDK continuity preparation returned, leaving replay
  preparation latency dependent on the legacy send-latch fallback instead of a
  renderer `pendingTurn`.
- Change: replay actions now preallocate a replay turn ref, publish a
  renderer pending turn through `DesktopConversationReplayRuntime`, broadcast
  that pending turn to Electron main, and forward the same turn ref through the
  continuity preparation command before dispatching the prepared turn.
- Validation target: `ConversationReplayActions.test.jsx` covers pending replay
  visibility before continuity preparation resolves, and
  `DesktopConversationReplayRuntime.test.js` covers the replay pending-turn
  shape.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  channel, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required; replay uses the existing
  SDK/main `turnRef` preparation field.

### 2026-06-21 Legacy Overlay Phase Reducer Removal

- Finding: `DesktopOverlayTurnLifecycleRuntime` still exposed
  `resolveOverlayTurnLifecycle(...)`, reducing `phase + isSending` into
  preflight/awaiting/active/terminal values even after visible lifecycle owned
  that decision. `DesktopChatLoopUiRuntime` also kept a test-only lifecycle to
  chat-loop UI reducer.
- Change: overlay lifecycle runtime now exposes only semantic lifecycle value
  getters and predicates; chat-loop runtime owns only transport recovery. Tests
  that previously rebuilt lifecycle from phase/send state now assert transport
  recovery or visible-lifecycle adapter behavior instead.
- Validation target: `OverlayTurnLifecycle.test.js`,
  `ChatLoopUiState.test.js`, `ChatLoopUiStateHook.test.jsx`, and
  `RendererAppRuntimeBoundary.test.ts` protect the retired resolver exports and
  remaining transport/lifecycle-value contracts.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Message-Only Current-Turn Presentation Adapter

- Finding: `DesktopCurrentTurnPresentationRuntime` still contained a legacy
  reducer from `phase + overlay lifecycle` into loop UI state, so busy,
  awaiting, chatbox awaiting, and awaiting-dot fields had a second authority
  beside `DesktopVisibleTurnLifecycleRuntime`. SDK overlay intent mode could
  also force response surface visibility without response entries.
- Change: `resolveCurrentTurnPresentationState(...)` is now a message/response
  adapter only: it selects the latest visible assistant reply and returns idle
  lifecycle defaults for the visible lifecycle adapter to stamp. SDK response
  overlay projection uses actual visible response entries for response state
  and keeps overlay intent as metadata for dismissal refs and trace context.
- Validation target: focused presentation and boundary tests protect the
  deleted imports, message-only default state, dismissed-response behavior, and
  overlay-intent-as-metadata rule.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Message Input Loop-Active Boundary

- Finding: dashboard `MessageInput` already received `composerBusy` from the
  visible lifecycle controller, but its public prop and helper naming still
  exposed the lock as raw `isSending`, preserving an obsolete send-latch
  authority at the composer boundary.
- Change: `ChatInterface.jsx` now passes `isLoopActive={composerBusy}`;
  `MessageInput.jsx` uses `isLoopActive` for Stop rendering, submit blocking,
  attachment/voice disabling, focus suppression, and plus-menu close behavior;
  `DesktopMessageInputRuntime.buildOutgoingMessage(...)` names the hard guard
  `isSubmitBlocked`.
- Validation target: `MessageInput.test.jsx`,
  `DesktopMessageInputRuntime.test.js`, and `ChatInterfaceWiring.test.jsx`
  protect submit blocking, Stop state, and stale raw `isSending=false` with an
  active visible lifecycle.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Live-Surface Visible Lifecycle Projection

- Finding: live-surface input still used SDK phase/presentation busy and
  overlay intent to produce phase, busy, awaiting, and response flags. The
  dashboard also used raw `isSending` as a UI disable authority for assistant
  feedback/retry actions.
- Change: `DesktopLiveTurnSurfaceRuntime` now accepts an already-resolved
  visible lifecycle, or resolves one itself, then maps live-surface
  phase/busy/awaiting/response fields from that lifecycle. SDK overlay intent
  remains metadata for rendering and guard refs. `ChatInterface.jsx` disables
  assistant actions from `composerBusy || canStop`, both derived from the
  visible lifecycle controller. Response overlay prefers SDK presentation rows
  when present and falls back to projection-built rows when presentation exists
  but carries no visible content.
- Validation target: `LiveTurnSurfaceState.test.js` protects false SDK
  presentation flags and hidden overlay intent during awaiting/response states,
  and `ChatInterfaceWiring.test.jsx` protects stale `isSending=true` with a
  terminal same-turn SDK projection while assistant actions remain enabled.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Current-Turn Projection Send-Latch Boundary

- Finding: the current-turn side-effect reducer still read SDK
  `presentation.typingVisible` and `presentation.overlayVisible` as lifecycle
  signals for `isSending`, even though ADR 006 marks those presentation fields
  as non-authorities.
- Change: `DesktopCurrentTurnProjectionEffectsRuntime` now accepts SDK
  awaiting from `currentTurn.phase`, ignores SDK `typingVisible` when deciding
  whether to keep typing latched, and treats overlay visibility as rendering
  data unless actual entries, explicit visible content, assistant text, tool
  rows, or terminal state are present. The temporary chat-surface presentation
  lifecycle bridge is removed so `useCurrentTurnPresentationState(...)` is only
  a message presentation adapter.
- Validation target: `DesktopCurrentTurnProjectionEffectsRuntime.test.ts`
  protects false SDK typing presentation during awaiting, overlay-visible empty
  presentations, and visible-entry clearing; it is part of `<windie> test
  core-loop`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Response Overlay SDK Lifecycle Reducer Removal

- Finding: `useResponseOverlayViewModel(...)` still used
  `resolveSdkCurrentTurnPresentationState(...)` for a full lifecycle-shaped
  state even though visible lifecycle now owns response-overlay busy and typing
  adaptation.
- Change: response overlay now treats SDK presentation entries and overlay
  intent as rendering data, then applies
  `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
  to stamp lifecycle fields. `DesktopCurrentTurnPresentationRuntime` now keeps
  a response-overlay data helper plus dismissal target projection, without the
  old SDK lifecycle reducer.
- Validation target: focused response-overlay state and renderer boundary tests
  protect SDK presentation response rendering while rejecting production use of
  the SDK lifecycle reducer.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Legacy Presentation Lifecycle Facade Cleanup

- Finding: `useChatSurfaceController(...)` still called
  `resolveSdkCurrentTurnPresentationState(...)` after resolving the renderer
  visible lifecycle, leaving the chat surface with a second SDK presentation
  lifecycle reducer for the same dashboard and pill busy/typing state. The
  old `useOverlayTurnLifecycle(...)` feature hook also kept legacy
  current-turn overlay lifecycle mapping outside the visible lifecycle facade.
- Change: the controller now keeps `useCurrentTurnPresentationState(...)` only
  as the legacy presentation-field adapter and always stamps it from
  `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`.
  Legacy overlay lifecycle helpers used by that adapter moved behind
  `DesktopVisibleTurnLifecycleRuntime`, and the old feature hook was deleted.
  The response overlay still owns SDK presentation entries and dismissal data
  until its remaining data path is collapsed in a later slice.
- Validation target: `ChatSurfaceController.test.jsx` continues to protect
  visible lifecycle busy/Stop, awaiting anchor, and local pending handoff, while
  `RendererAppRuntimeBoundary.test.ts` rejects a controller import of
  `DesktopCurrentTurnPresentationRuntime` and the deleted overlay lifecycle
  hook. `DesktopVisibleTurnLifecycleRuntime.test.js` covers the legacy overlay
  lifecycle adapter functions now exposed only through the visible lifecycle
  runtime facade.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Visible Lifecycle Preflight And Overlay Adapter Tightening

- Finding: live-surface local send-preflight handoff still lived beside
  overlay presentation input, and the shared lifecycle-to-presentation adapter
  owned busy and awaiting fields but left the legacy `overlayTurnLifecycle`
  field intact for response-overlay view code to inspect.
- Change: `DesktopVisibleTurnLifecycleRuntime` now owns
  `shouldUseLocalSendPreflight(...)` for live-surface consumers and
  `applyVisibleTurnLifecycleToPresentationState(...)` stamps
  `overlayTurnLifecycle` from the visible lifecycle status, mapping
  `local_pending` to preflight and SDK awaiting/active/terminal/idle to their
  legacy overlay equivalents.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js` asserts the
  local preflight handoff predicate plus adapter overwrites stale lifecycle
  fields for pending, active, and terminal states.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, trust-boundary, or storage
  migration required.

### 2026-06-21 Dashboard Awaiting Anchor Row-Shape Cleanup

- Finding: dashboard `MessageList` routing had already stopped computing live
  progress suppression locally, but the regression pack did not protect the
  deletion target that durable tool/progress row shape must not veto renderer
  pending typing.
- Change: deleted the live-progress row-shape helper, updated
  `ChatInterfaceWiring.test.jsx` to assert phase-only streaming does not show
  typing without pending or visible content, while renderer pending still shows
  the awaiting dot even when durable tool rows are present, and kept
  `useChatSurfaceController(...)` active when the SDK current-turn conversation
  ref is ahead of the session ref; added the file to `<windie> test core-loop`.
- Validation target: `ChatInterfaceWiring.test.jsx` protects dashboard message
  list awaiting-anchor routing through the visible lifecycle owner instead of
  row-shape suppression.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, trust-boundary, or storage
  migration required.

### 2026-06-21 Response Overlay Visible Lifecycle Routing

- Finding: `useResponseOverlayViewModel` still reduced live-turn input,
  SDK presentation, and response-overlay phase into awaiting/response state
  independently from the renderer visible lifecycle owner.
- Change: moved the lifecycle-to-presentation adapter into
  `DesktopVisibleTurnLifecycleRuntime`, reused it from both chat surface and
  response overlay hooks, and routed overlay awaiting/response state through
  the same visible lifecycle projection.
- Validation target: `ChatBoxResponse.state.test.jsx` now protects pending
  sends through hidden/visible-empty SDK projections and asserts phase-only
  `streaming`/`tool-output` projections do not show typing without renderer
  pending or visible SDK content; the test is registered in
  `<windie> test core-loop`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, or storage migration
  required; the slice removes response-overlay phase-only typing authority.

### 2026-06-21 Chat Surface Controller Visible Lifecycle Routing

- Finding: after the visible lifecycle runtime landed, `useChatSurfaceController`
  still let the legacy current-turn presentation hook decide busy, Stop,
  awaiting-dot, and chatbox awaiting state for dashboard and pill consumers.
- Change: routed controller state through
  `DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)`,
  exposed `visibleTurnLifecycle`, and adapted the legacy presentation result
  from lifecycle status so local pending and SDK awaiting use one owner.
- Validation target: `ChatSurfaceController.test.jsx` covers visible lifecycle
  busy/Stop projection, awaiting anchors, and local pending through SDK idle or
  visible-empty handoff; `<windie> test core-loop` covers the broader replay.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution, or
  storage migration required; this slice routes dashboard/pill presentation
  through the renderer lifecycle owner.

### 2026-06-21 Visible Turn Lifecycle Runtime And Handoff Predicate

- Finding: renderer pending-turn clearing and live-surface preflight handoff
  still used separate predicates, so SDK idle, wrong-turn, or visible-empty
  projections could drift from the visible lifecycle rules in ADR 006.
- Change: added `desktopVisibleTurnLifecycleRuntime` as the renderer app-runtime
  owner for visible lifecycle projection and same-turn SDK handoff rules, then
  routed `chatStore.ts` pending clearing through
  `resolvePendingTurnForCurrentProjection(...)` and live-surface pending-turn
  handoff through the same runtime owner.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js` protects the
  replay from `local_pending` through SDK idle, visible-empty, awaiting, active,
  terminal, and wrong-turn terminal states, and is registered in
  `<windie> test core-loop`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, or storage migration
  required; this slice changes only renderer projection ownership.

## Goal

Implement [ADR 006](../docs/adr/006-renderer-owned-typing-state.md): make one
renderer app-runtime visible turn lifecycle projection the source of truth for
dashboard, chat pill, response overlay, Stop/busy controls, and typing state.

The target user-visible invariant is:

```text
User send accepted for turn X means desktop surfaces render local_pending for X
until SDK emits an authoritative same-turn state that advances to awaiting,
active, or terminal. SDK idle, stale, wrong-turn, or visible-but-empty
projections must not clear local_pending.
```

The implementation should remove duplicate and legacy lifecycle authorities
instead of adding another fallback around the dashboard typing dot.

## Current Problem

Typing and busy state can currently be inferred from several independent
sources:

- renderer `pendingTurn`
- renderer `isSending`
- renderer `streamTracking.phase`
- renderer `thinkingStatus`
- SDK `currentTurnProjection.phase`
- SDK `currentTurnProjection.presentation.typingVisible`
- SDK `currentTurnProjection.presentation.overlayVisible`
- SDK `currentTurnProjection.presentation.overlayIntent`
- SDK/durable display rows
- dashboard row suppression such as `hasLiveProgressMessages`

Those fields are not all authoritative state. Some are raw input, some are SDK
presentation, some are renderer compatibility state, and some are row-rendering
details. Because dashboard, pill, overlay, and message rows infer lifecycle in
different places, transient SDK idle or visible-but-empty projections can make
typing flicker or busy state drift.

## Desired End State

One renderer app-runtime module owns visible turn lifecycle:

```text
pendingTurn + SDK currentTurnProjection + explicit stop/cancel result
  -> visibleTurnLifecycle
  -> dashboard / pill / overlay / Stop / busy / typing renderers
```

The lifecycle state set is:

| State | Meaning |
| --- | --- |
| `local_pending` | Renderer accepted user send for turn X before SDK/backend authority exists. |
| `awaiting` | Backend accepted turn X and no visible content/progress/error has emitted yet. |
| `active` | Backend emitted visible reasoning, text, tool call, tool output, tool progress, search progress, or error content for X. |
| `terminal` | Backend completed, errored, or stopped X; busy/typing clears while terminal content may remain visible. |
| `idle` | No active turn for the conversation; cannot override `local_pending` for X. |

Surfaces should consume the lifecycle output. They should not independently
decide lifecycle from lower-level fields.

## Non-Goals

- Do not move renderer-local `local_pending` into the SDK in this migration.
- Do not make the dashboard component own lifecycle fixes.
- Do not remove SDK `currentTurnProjection`; it remains the SDK/backend event
  projection source.
- Do not remove durable display rows or SDK presentation entries; they remain
  rendering data.
- Do not change backend provider semantics or websocket event names unless a
  concrete SDK projection bug is found.
- Do not keep compatibility aliases or fallback lifecycle state without a named
  dependency and deletion path.

## Owner Boundary

SDK owns:

- normalized backend conversation events
- `currentTurnProjection`
- display/rehydrate projection from SDK-owned event state
- presentation entries derived from SDK turn content

Renderer app-runtime owns:

- local pending-send acceptance
- same-turn SDK handoff rules
- desktop-visible lifecycle state
- dashboard/pill/overlay/Stop/busy typing projection

Renderer components own:

- rendering layout
- row composition
- anchors and visual placement after lifecycle has already been resolved

## Target Runtime Shape

Create or designate a renderer app-runtime owner, for example:

```text
frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.ts
```

Recommended output shape:

```ts
type DesktopVisibleTurnLifecycleStatus =
  | 'local_pending'
  | 'awaiting'
  | 'active'
  | 'terminal'
  | 'idle';

type DesktopVisibleTurnLifecycle = {
  status: DesktopVisibleTurnLifecycleStatus;
  source: 'local' | 'sdk';
  conversationRef: string | null;
  turnRef: string | null;
  awaitingAnchor: {
    kind: 'user-message';
    rowId: string;
  } | null;
  entries: unknown[];
  terminalReason: 'complete' | 'error' | 'stopped' | null;
  isBusy: boolean;
  showTyping: boolean;
};
```

The exact type can be refined during implementation, but the important rule is
that dashboard, pill, overlay, Stop, busy, and typing should read from this
projection rather than recomputing lifecycle independently.

## Authoritative Handoff Resolver

Centralize pending-turn handoff behind the visible lifecycle owner:

```text
resolvePendingTurnForCurrentProjection({ pendingTurn, currentTurnProjection })
```

The public facade should return `null` only when SDK projection belongs to the
same conversation and turn and represents one of:

- SDK awaiting acceptance for the turn
- visible reasoning text
- visible assistant text
- tool call
- tool output
- tool progress
- search progress/source progress
- visible error content
- terminal complete/error/stopped for the turn

It should keep the original pending turn for:

- no SDK projection
- wrong conversation
- wrong turn
- SDK idle
- stale previous-turn terminal projection
- visible-but-empty projection with no content, progress, awaiting, or terminal
  authority

The lower-level same-turn authority predicate should remain private to the
visible lifecycle runtime. Store and surface consumers should use the facade so
pending-turn clearing and visible lifecycle handoff cannot drift again.

## Cleanup Targets

### Remove As Lifecycle Authorities

These fields may remain temporarily, but they must stop deciding typing/busy
lifecycle:

- `isSending`
- `streamTracking.phase`
- `thinkingStatus`
- `currentTurnProjection.presentation.typingVisible`
- `currentTurnProjection.presentation.overlayVisible`
- `currentTurnProjection.presentation.overlayIntent.mode`
- `hasLiveProgressMessages`
- durable display-row refresh timing
- message row shape

### Keep As Data Or Derived Detail

- `pendingTurn`: authoritative renderer-local raw input.
- `currentTurnProjection`: authoritative SDK raw input.
- `messages`: durable/rendered rows and typing anchor lookup only.
- SDK `presentation.entries`: visible active content/progress rows.
- `thinkingStatus`: compaction/manual status copy only, not core turn typing.
- `streamTracking`: diagnostics or legacy compatibility only until deleted.

### Delete Or Collapse

- Duplicate pending clear/handoff logic between `chatStore.ts` and
  `desktopLiveTurnSurfaceRuntime.js`.
- Dashboard-specific `hasLiveProgressMessages ? null : awaitingDotTargetMessageId`
  lifecycle suppression once visible lifecycle carries `active`.
- `useCurrentTurnPresentationState` as a lifecycle authority or presentation
  shim. It has been deleted; surface hooks call app-runtime presentation
  projection directly and visible lifecycle remains the lifecycle authority.
- `resolveSdkCurrentTurnPresentationState` as a competing lifecycle reducer.
  It has been deleted in favor of response-overlay data projection plus visible
  lifecycle adaptation.
- Direct surface use of `isSending` for Stop/busy where visible lifecycle can
  provide `isBusy`.

## Implementation Phases

### Phase 0: Lock The Bug As An Invariant

Add failing owner tests before refactoring:

- renderer app-runtime replay test:

```text
user_send_accepted
pending_turn_created
sdk_current_turn_idle
sdk_current_turn_visible_empty
sdk_current_turn_awaiting
assistant_delta
streaming_complete
```

- assert visible lifecycle never leaves `local_pending` or `awaiting` before
  authoritative SDK same-turn handoff
- assert wrong-turn idle/terminal projections do not clear local pending
- assert terminal same-turn stop clears busy/typing for the correct turn

Add these tests to the Core Loop Regression Pack and User-Facing Regression
Pack routes when not already covered.

### Phase 1: Introduce The Renderer App-Runtime Lifecycle Reducer

Add the visible lifecycle runtime with pure reducer tests.

Inputs:

- active conversation ref
- `pendingTurn`
- `currentTurnProjection`
- optional stop/cancel state
- messages only for anchor lookup

Outputs:

- lifecycle status
- same-turn identity
- `showTyping`
- `isBusy`
- entries/progress rows
- awaiting anchor
- terminal reason

Do not route UI through it yet except in tests. This keeps the first step easy
to review.

### Phase 2: Route Chat Surface Controller Through The Reducer

Make `useChatSurfaceController` consume visible lifecycle and expose the same
public shape expected by existing dashboard and pill callers.

Expected effects:

- `composerBusy` derives from visible lifecycle.
- `canStop` derives from visible lifecycle.
- dashboard awaiting dot derives from visible lifecycle.
- SDK idle and visible-but-empty projections cannot clear local pending.

Keep adapter fields only to avoid broad JSX churn in the first routing change.

### Phase 3: Route Response Overlay And Chat Pill Through The Same Projection

Update `useResponseOverlayViewModel`, minimal chat pill, and overlay window sync
to consume visible lifecycle instead of independently interpreting SDK
presentation or live-turn surface input.

Expected effects:

- dashboard, pill, and overlay report the same lifecycle for the same
  conversation/turn
- Stop button and overlay visibility agree
- response overlay uses lifecycle entries and terminal state rather than
  independent `overlayIntent` authority

### Phase 4: Collapse Duplicate Pending Handoff Logic

Move pending-turn handoff into the shared predicate.

Replace:

- `shouldCurrentTurnClearPendingTurn` in `chatStore.ts`
- `shouldUseSendPreflight` handoff checks in `desktopLiveTurnSurfaceRuntime.js`
- any parallel "hidden SDK presentation" checks that duplicate the same
  decision

with a single renderer app-runtime handoff predicate.

The store can still mutate `pendingTurn`, but it should use the same owner
predicate as surface lifecycle.

### Phase 5: Remove Legacy Lifecycle Inputs From Surfaces

Remove or downgrade direct lifecycle use of:

- `isSending`
- `streamTracking.phase`
- `thinkingStatus`
- SDK `presentation.typingVisible`
- SDK `presentation.overlayVisible`
- SDK `presentation.overlayIntent.mode`
- `hasLiveProgressMessages`

Where removal is not immediately possible, leave a documented compatibility
comment and a follow-up deletion test.

### Phase 6: Delete Stale Tests And Update Docs

After the new reducer routes all surfaces:

- delete tests that only protect legacy helper behavior
- update tests to assert lifecycle projection instead of old intermediate
  fields
- update dashboard/pill/overlay docs
- update SDK conversation docs only if SDK current-turn semantics change
- keep ADR 006 as the architectural source of truth

## Validation Plan

During implementation, run narrow tests first:

```bash
<windie> test frontend -- <new-visible-lifecycle-test>
<windie> test frontend -- ChatSurfaceController LiveTurnSurfaceState ChatBoxResponse ChatInterfaceWiring
```

Before each commit that changes visible lifecycle behavior:

```bash
<windie> test core-loop
```

Before finishing a migration slice:

```bash
<windie> test user-facing
<windie> docs list
cd frontend && npm run lint
git diff --check
```

## Migration And Compatibility Notes

No persisted data migration should be required if this remains a renderer
projection cleanup. If any implementation changes SDK event payloads, IPC
payloads, transcript storage, or rehydrate semantics, that slice must include a
specific compatibility note and focused tests.

Security-sensitive behavior should remain unchanged. This plan does not alter
credentials, permissions, local execution authority, provider policy, backend
routes, or local-runtime tool execution.

## Completion Criteria

- One renderer app-runtime reducer owns visible typing and turn lifecycle.
- Dashboard, chat pill, response overlay, Stop, busy, and typing read from that
  reducer.
- Local pending cannot be cleared by SDK idle, stale, wrong-turn, or
  visible-but-empty projections.
- `isSending`, `streamTracking`, `thinkingStatus`, SDK presentation flags,
  display-row refresh timing, and message row shape no longer independently
  decide typing lifecycle.
- Duplicate pending handoff predicates are collapsed into one owner predicate.
- Core Loop Regression Pack includes the replay that originally exposed this
  class of bug.
