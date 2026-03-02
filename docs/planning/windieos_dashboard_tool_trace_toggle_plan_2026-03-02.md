---
summary: "Implementation plan for a dashboard toggle that shows/hides tool-call and tool-output rows in the chat thread without changing underlying tool execution."
read_when:
  - Adding dashboard-level controls for tool visibility in chat transcript rendering.
  - Changing ChatInterface/MessageList wiring for message filtering.
  - Adding frontend tests for dashboard message visibility toggles.
title: "WindieOS Dashboard Tool Trace Toggle Plan (2026-03-02)"
---

# WindieOS Dashboard Tool Trace Toggle Plan (2026-03-02)

## Objective

Add a dashboard toggle that lets users show/hide tool trace rows:
- `tool-call`
- `tool-output`

Behavior target:
- Tool execution and backend flow unchanged.
- Only dashboard thread rendering changes.
- Default remains visible (trace shown).

## Current Runtime Shape (What Exists Today)

- Dashboard chat thread is rendered through:
  - `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
  - `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `ChatInterface` passes full `messages` directly to `MessageList`.
- `MessageContent` renders dedicated tool sections when message type is `tool-call` / `tool-output`.
- Utility icons already exist in header (`chat-utility-controls`) for TTS/dev controls.

Implication:
- Minimal-risk insertion point is `ChatInterface` message filtering + one new header icon button.
- No backend, sidecar, or tool-runner contract changes required.

## UX Contract

Toggle control:
- Location: dashboard chat header utility controls (same row as TTS icon).
- Icons: `Eye` (trace hidden -> click to show), `EyeOff` (trace visible -> click to hide).
- Accessible labels/tooltips:
  - visible state: `"Hide tool trace"`
  - hidden state: `"Show tool trace"`

Thread behavior:
- ON (default): render all message types (existing behavior).
- OFF: hide only messages where `type` is `tool-call` or `tool-output`.
- Non-tool assistant/user rows remain unchanged.

Out of scope (for this slice):
- New backend config field for persistence.
- Settings panel wiring.
- Changing transcript storage format.

## Implementation Plan

## Phase 1: Renderer Toggle State + Filter

1. Add local UI state in `ChatInterface`:
   - `const [showToolTrace, setShowToolTrace] = useState(true);`
2. Add `Eye` / `EyeOff` icon button in `.chat-utility-controls`.
3. Build `visibleMessages` via `useMemo`:
   - if `showToolTrace === true`: use original `messages`
   - else filter out `tool-call`/`tool-output`
4. Pass `visibleMessages` to `MessageList` instead of raw `messages`.

Files:
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`

## Phase 2: Awaiting/Loop Visual Consistency

Guard against awaiting-dot drift when tool rows are hidden:
- derive `hasVisibleReply` from `visibleMessages` (not raw `messages`) for `useChatLoopUiState`.
- keep stop-button logic bound to stream phase (raw runtime), not filtered visibility.

Files:
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`

## Phase 3: Styling

Use existing button class (`chat-top-icon-btn`) for visual consistency.

Only add CSS if needed (likely none).
If needed:
- `frontend/src/renderer/styles/ChatInterface.css`

## Phase 4: Tests

Add/extend frontend tests in `tests/frontend/ChatInterfaceWiring.test.jsx`:

1. Renders tool-trace toggle button.
2. Default state shows tool rows (MessageList receives full message array).
3. Clicking toggle hides tool rows (MessageList receives filtered array).
4. Clicking again restores full list.
5. Tooltip/aria-label flips correctly between show/hide.
6. Awaiting indicator behavior remains correct with hidden tool rows.

Optional follow-up:
- Add a focused unit test for the filter helper if extracted.

## Risk Notes

1. Awaiting indicator mismatch
- If derived from raw `messages`, UI can appear idle while only hidden tool rows exist.
- Mitigation: compute visibility-sensitive reply checks from `visibleMessages`.

2. Replay/try-again semantics
- Hidden tool rows should not break assistant actions.
- Mitigation: keep replay handlers bound to raw store `messages`; filter is render-only.

3. Scope creep into persistent settings
- Persisting toggle through backend settings adds cross-layer schema/config work.
- Mitigation: keep this slice local-state only.

## Acceptance Criteria

1. Dashboard has a working eye toggle in header.
2. Toggle hides/shows only tool-call/tool-output rows.
3. No tool execution behavior changes.
4. No backend/sidecar schema changes.
5. Frontend tests cover toggle state and filtered rendering behavior.

## Follow-Up Option (Separate Slice)

If persistence is later desired:
- Add a frontend-only localStorage key for dashboard display preference, or
- Promote to formal frontend config field and wire through config filter/settings UI.

Recommend deferring until the base toggle ships and UX feedback is collected.
