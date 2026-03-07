---
summary: "Deep reference for shared current-turn presentation behavior: latest-user turn boundary scan, allowed-type filtering, and shared dashboard/overlay reply projection contracts."
read_when:
  - When changing assistant-reply visibility logic in `ChatInterface.jsx` or `ChatBoxResponse.jsx`.
  - When debugging awaiting-dot or response-pill state that incorrectly includes stale assistant rows from earlier turns.
title: "Current-Turn Presentation and Visible Assistant Reply Contract Reference"
---

# Current-Turn Presentation and Visible Assistant Reply Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/ChatInterfaceWiring.test.jsx`
- `tests/frontend/CurrentTurnPresentationStateHook.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Helper API Surface

Exported functions:

- `findLastUserIndex(messages)`
- `findLatestVisibleAssistantReply(messages, allowedTypes)`
- `resolveChatTurnPresentationState({ messages, loopUiState, dismissedResponseId, allowedTypes, activeResponse })`

## Turn-Boundary Scan Contract

`findLastUserIndex(messages)`:

- scans backward from the end of the array
- returns the index of the latest row where `sender === "user"`
- returns `-1` when no user row exists

`findLatestVisibleAssistantReply(messages, allowedTypes)`:

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

The helper does not hardcode message types. Caller supplies the allowed set.

Current call sites pass:

- `new Set(["llm-text", "error"])`

This keeps type-filter policy explicit at component call sites.

## Shared Presentation Contract

`useCurrentTurnPresentationState(...)` composes:

1. `findLatestVisibleAssistantReply(...)`
2. `useChatLoopUiState(...)`
3. `resolveChatTurnPresentationState(...)`

It returns one shared snapshot for dashboard and overlay consumers:

- `loopUiState`
- `isBusy`
- `isAwaitingReply`
- `isTransportConnected`
- `activeResponse`
- `hasVisibleReply`
- `showAssistantAwaitingDot`
- `visibleResponse`
- `chatboxSurfaceState`
- `showChatboxAwaitingReply`
- `showChatboxResponse`

## Consumer Contracts

`ChatInterface.jsx`:

- uses the shared snapshot for busy/stop behavior and awaiting-dot visibility
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
