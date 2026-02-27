---
summary: "Deep reference for response overlay renderer behavior: phase-driven visibility, awaiting/thinking states, closeability rules, and dynamic sizing IPC updates."
read_when:
  - When changing `ChatBoxResponse.jsx` rendering logic or response overlay UX states.
  - When debugging missing response panes, stale awaiting indicators, or incorrect response overlay resize behavior.
title: "Response Overlay Phase Runtime Reference"
---

# Response Overlay Phase Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/chatBoxResponseUtils.js`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/chat/utils/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/hooks/useAutoResizedResponseHeight.js`
- `frontend/src/renderer/infrastructure/markdown.ts`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Input State and Message Selection

Primary inputs:

- `messages`
- `thinkingStatus`

Selection logic:

1. `findLastUserIndex(messages)` resolves latest user turn boundary.
2. `findLatestMessageAfterUser(...)` resolves latest assistant `llm-text`/`error` after boundary.

Closeability:

- `error` rows are closeable immediately.
- `llm-text` rows are closeable only when `isComplete === true`.

## Phase-Driven View Modes

Overlay phase channel: `response-overlay-phase`.

Modes:

- `showResponse`:
  - assistant response exists
  - not awaiting first chunk
  - not manually dismissed
- `showAwaitingReply`:
  - awaiting mode / phase is `awaiting-first-chunk` or `tool-call`
  - or chat thinking source is `context-compaction-started` with active compaction status text
  - no visible response row

Rendering:

- returns `null` when both modes are false.

## Response Pane Behavior

- `error` renders plain text.
- `llm-text` renders sanitized markdown.
- response height measured from content and clamped:
  - min `92`
  - max `460`
- `ResizeObserver` + RAF scheduling updates `set-responsebox-size` IPC payload.

Scroll behavior:

- tracks overflow-above class state.
- bottom-stick threshold keeps stream pinned until user scrolls up.

## Awaiting and Thinking Stream Behavior

- awaiting mode shows typing indicator.
- thinking text renders in dedicated stream container with independent overflow tracking.
- thinking stream uses separate bottom-stick threshold from response pane.
- compaction-start status (`Compacting conversation history...`) reuses the same awaiting/thinking stream elements.

## Overlay Size IPC Contract

`set-responsebox-size` payloads:

- hidden: `{ visible: false, width: 0, height: 0 }`
- shown: `{ visible: true, width, height }`

Dedupe behavior:

- skips repeated identical size payloads.
- unmount cleanup always sends hidden payload.

## Tool-Ghost Status (Current)

Current production `ChatBoxResponse` runtime does not parse/render model tool-ghost previews from tool-call payload JSON.

Remaining tool-ghost UI pieces are debug-harness scoped (`ToolGhostDebugApp`, `ToolGhostCursor`) and documented in the sibling tool-ghost pages.

## Related Pages

- [Frontend Renderer Overlay Docs Hub](README.md)
- [Renderer Overlay Tool Ghost Docs Hub](tool_ghost/README.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
