---
summary: "Deep reference for renderer assistant-reply selection helper behavior: latest-user turn boundary scan, allowed-type filtering, and shared dashboard/overlay usage contracts."
read_when:
  - When changing assistant-reply visibility logic in `ChatInterface.jsx` or `ChatBoxResponse.jsx`.
  - When debugging awaiting-dot or response-pill state that incorrectly includes stale assistant rows from earlier turns.
title: "Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference"
---

# Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/message/latestVisibleAssistantReply.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/ChatInterfaceWiring.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Helper API Surface

Exported functions:

- `findLastUserIndex(messages)`
- `findLatestVisibleAssistantReply(messages, allowedTypes)`

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

## Consumer Contracts

`ChatInterface.jsx`:

- uses helper result (`hasVisibleReply`) for loop projection via `useChatLoopUiState(...)`
- awaiting-dot visibility only appears when no qualifying visible reply exists

`ChatBoxResponse.jsx`:

- uses helper result as `activeResponse`
- applies additional dismissal/closeability gating on top (`closedResponseId`, completion rules)
- response pill therefore stays scoped to the latest active user turn

## Drift Hotspots

1. Expanding helper scan to include rows before latest user boundary will leak stale responses into active-turn UI states.
2. Hardcoding message types inside helper instead of caller-provided set can desync dashboard and overlay behavior.
3. Removing non-empty `text` guard can surface placeholder assistant rows as visible replies.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Response Overlay Phase Runtime Reference](../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](../loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
