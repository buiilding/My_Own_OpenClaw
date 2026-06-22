---
summary: "Deep reference for shared current-turn presentation behavior: latest-user turn boundary scan, allowed-type filtering, and shared dashboard/overlay reply projection contracts."
read_when:
  - When changing assistant-reply visibility logic in `ChatInterface.jsx` or `MinimalResponseOverlay.jsx`.
  - When debugging awaiting-dot or response-pill state that incorrectly includes stale assistant rows from earlier turns.
title: "Current-Turn Presentation and Visible Assistant Reply Contract Reference"
---

# Current-Turn Presentation and Visible Assistant Reply Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `tests/frontend/ChatInterfaceWiring.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Helper API Surface

`desktopCurrentTurnPresentationRuntime.js` keeps helper functions and default
visible-assistant type sets private behind `DesktopCurrentTurnPresentationRuntime`.
Facade methods:

- `DesktopCurrentTurnPresentationRuntime.findLatestVisibleAssistantReply(messages, allowedTypes)`
- `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState({ messages, dismissedResponseId, allowedTypes, activeResponse })`

## Turn-Boundary Scan Contract

`findLastUserIndex(messages)`:

- scans backward from the end of the array
- returns the index of the latest row where `sender === "user"`
- returns `-1` when no user row exists

`DesktopCurrentTurnPresentationRuntime.findLatestVisibleAssistantReply(messages, allowedTypes)`:

- computes lower scan bound:
  - if user row exists: `lastUserIndex + 1`
  - else: `0`
- scans backward from latest message down to that lower bound
- returns first assistant row matching all conditions:
  - `sender === "assistant"`
  - `text` is truthy
  - `allowedTypes.has(message.type)` is true
- returns `null` when no row matches

Operational implication:

- assistant rows before the latest user row are intentionally ignored
- stale prior-turn assistant content cannot drive current awaiting/response UI

## Allowed-Type Ownership Boundary

The runtime owns the default visible-assistant reply type set privately:

- `llm-text`
- `error`

`ChatInterface` and `useChatSurfaceController` use that default by omitting
`allowedTypes`, so React feature code does not import raw type-set constants.
Focused tests and future specialized callers may still pass `allowedTypes` to
the facade methods when they need an explicit override.

## Shared Presentation Contract

Surface hooks call
`DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
directly. That app-runtime facade composes
`findLatestVisibleAssistantReply(...)` with message-only presentation state.

It returns a message-only presentation snapshot before visible lifecycle
stamping:

- `isBusy` (`false` until visible lifecycle stamping)
- `activeResponse`
- `hasVisibleReply`
- `awaitingDotTargetMessageId` (`null` until visible lifecycle stamping)
- `visibleResponse`
- `chatboxSurfaceState`

`useChatSurfaceController(...)` owns transport/lifecycle composition by applying
`DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
to that snapshot. Message-only presentation resolution does not read `phase`,
overlay lifecycle, `isSending`, SDK presentation visibility flags, or transport
recovery state as typing authorities.

After visible lifecycle stamping, awaiting-dot visibility is stricter than
response-pane visibility:

- the main chat awaiting dot renders only before the current turn has visible assistant activity
- assistant `thinkingText` after the latest user row counts as visible activity for the main list, because it makes the per-message `Show thinking` disclosure eligible
- live current-turn progress rows rendered by the dashboard (`tool-explanation` and web-search `search-source`) suppress the awaiting dot even before the first `llm-text` row arrives
- prior-turn progress rows before the latest user row must not suppress the awaiting dot for a later user turn
- thinking-only assistant placeholders do not count as visible replies for response-pane selection, so they do not become `activeResponse` / `visibleResponse`

## Consumer Contracts

`ChatInterface.jsx`:

- uses the visible-lifecycle-stamped snapshot for busy/stop behavior and
  awaiting-dot visibility
- dashboard no longer performs its own assistant-reply scan

`ChatBox.jsx`:

- uses the shared snapshot for loop lock behavior
- pill input/controls no longer maintain a separate loop-visibility path

`ChatBoxResponse.jsx`:

- uses shared `activeResponse` and chatbox surface state
- applies additional dismissal/closeability gating on top (`closedResponseId`, completion rules)
- response pill therefore stays scoped to the latest active user turn

## Drift Hotspots

1. Expanding helper scan to include rows before latest user boundary will leak stale responses into active-turn UI states.
2. Reintroducing component-local `hasVisibleReply` or surface projection logic will desync dashboard and overlay behavior.
3. Removing non-empty `text` guard can surface placeholder assistant rows as visible replies.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Response Overlay Phase Runtime Reference](../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](../loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
