---
summary: "Deep reference for response overlay renderer behavior: phase-driven visibility, awaiting/thinking states, closeability rules, dynamic sizing, and tool-ghost coordinate preview logic."
read_when:
  - When changing `ChatBoxResponse.jsx` rendering logic or response overlay UX states.
  - When debugging missing response panes, stale awaiting indicators, or incorrect tool-ghost target placement.
title: "Response Overlay Phase and Tool-Ghost Runtime Reference"
---

# Response Overlay Phase and Tool-Ghost Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/chat/utils/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/utils/toolGhostPreview.js`
- `frontend/src/renderer/infrastructure/markdown.ts`

## Input State and Message Selection

Primary store inputs:

- `messages`
- `thinkingStatus`

Selection logic:

1. find latest user index
2. find latest assistant message after that user for allowed response types (`llm-text`, `error`)
3. find latest assistant tool-call message after that user for tool-ghost mode

Closeability:

- `error` responses always closeable
- `llm-text` responses closeable only when `isComplete === true`

## Phase-Driven View Modes

Overlay phase listener uses channel `response-overlay-phase`.

`awaitingFirstChunk` is toggled by phase and by new user turn detection.

Visibility modes:

- `showResponse`:
  - response exists
  - not awaiting first chunk
  - response not manually dismissed
- `showAwaitingReply`:
  - awaiting-first-chunk mode or explicit `overlayPhase === "awaiting-first-chunk"`
  - no visible response
  - not in `tool-call` phase
- `showToolGhost`:
  - no visible response
  - `overlayPhase === "tool-call"`
  - tool-call message exists

Overlay renders `null` when all modes are false.

## Response Pane Behavior

Response text rendering:

- `error` uses plain text node
- `llm-text` uses sanitized markdown HTML from `toSanitizedMarkdownHtml(...)`

Height behavior:

- measured from response body scroll height + chrome height
- clamped:
  - min: `92`
  - max: `460`
- resize updates scheduled on `requestAnimationFrame`
- `ResizeObserver` recomputes on content changes

Scrolling behavior:

- tracks "overflow above" indicator state
- auto-sticks to bottom until user scrolls upward past threshold

## Awaiting/Thinking Stream Behavior

Thinking text surface:

- shown only in awaiting mode when trimmed thinking text exists
- rendered in `pre` element with `aria-live="polite"`

Thinking scroll:

- separate bottom-stick tracking and overflow indicator from response pane
- threshold tuned separately from response pane

## Tool-Ghost Preview Pipeline

Source:

- latest assistant `tool-call` message text (expected JSON)

`buildToolGhostPreviewFromMessageText(...)`:

1. parse JSON payload
2. normalize tool entries (`name`, `args`, `metadata`)
3. choose target-capable entry when available
4. resolve label precedence:
   - `args.explanation`
   - `name + wait_seconds`
   - fallback generic label
5. resolve target point from coordinate contract / rect metadata
6. emit ratios + optional rectangle CSS variables

Coordinate sources considered:

- `metadata.coordinate_contract.normalized_coordinates`
- direct `args.x` / `args.y`
- rectangle center fallback (`target_rect`)

If coordinates absent:

- preview still renders label
- target defaults to centered neutral ghost

Execution sync behavior:

- click-like `mouse_control` actions (`click`, `double_click`, `right_click`) are delayed `1900ms` in `useToolRunner` before real sidecar execution.
- this delay is intentional to let ghost click animation complete before real click dispatch.

## Overlay Frame Size IPC

`reportOverlaySize(visible)` sends:

- channel: `set-responsebox-size`
- hidden payload: `{ visible: false, width: 0, height: 0 }`
- shown payload: `{ visible: true, width, height }` (rounded frame bounds)

Dedupe:

- component tracks last sent `{ width, height, visible }`
- skips redundant sends

Unmount cleanup forces hide payload.

## Related Tests

- `tests/frontend/ChatBoxResponse.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Debug Checklist

If overlay stays in awaiting mode after chunks arrive:

1. verify phase transition out of `awaiting-first-chunk`
2. verify response candidate exists (`llm-text` or `error`)
3. verify dismissed response ID is not suppressing the new response

If response never becomes closeable:

1. verify assistant message receives `isComplete=true` on `streaming-complete`
2. inspect type (`error` vs `llm-text`) and closeability branch
3. verify message association after latest user message boundary

If tool ghost is misplaced:

1. inspect tool-call message JSON shape and parse validity
2. inspect coordinate contract fields (`target_display_size`, coordinates, rect)
3. verify normalized ratio outputs map to CSS custom properties on ghost track
