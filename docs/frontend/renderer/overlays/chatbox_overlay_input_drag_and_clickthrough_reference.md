---
summary: "Deep reference for chatbox overlay renderer behavior: input/send lifecycle, click-through toggling, drag movement IPC, and fixed-size preview-lane behavior."
read_when:
  - When changing `ChatBox.jsx` interaction rules or overlay input behavior.
  - When debugging chatbox focus/click-through drift, drag positioning, or startup/attachment flicker.
title: "Chatbox Overlay Input, Drag, and Click-Through Reference"
---

# Chatbox Overlay Input, Drag, and Click-Through Reference

## Canonical Modules

- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatBoxBindings.js`
- `frontend/src/renderer/features/chat/components/chatbox/ChatBoxIcons.jsx`
- `frontend/src/renderer/features/chat/components/chatbox/ChatBoxImagePreviewRow.jsx`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/clipboardImageUtils.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/state/stopQueryState.js`
- `frontend/src/renderer/features/chat/utils/state/streamPhaseState.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`

## App Composition Boundary

`ChatBoxApp` renders:

- `AppProvider`
- `ChatProvider(enableToolRunner=false, enableTranscript=false)`
- `ChatBox`

This keeps overlay window lightweight:

- no transcript writes
- no frontend tool execution listeners
- chatbox still sends queries through `useChatMessageSender(...)`

## Send Path and Overlay Surface Policy

`ChatBox` calls:

- `useChatMessageSender(undefined, { senderSurface: "overlay-chatbox" })`
- `useResponseOverlayPhase()` so the overlay chat pill reads one shared main-process phase channel instead of carrying duplicated local phase listeners in each component.

`useChatBoxBindings` encapsulates chatbox runtime effect bindings:

- explicit focus lifecycle (`chatbox-focus` + mount focus)
- wakeword STT trigger channel handling (`wakeword-stt-trigger`)
- global drag window listeners (`mousemove`/`mouseup`/`blur`)
- visual-anchor IPC sync and compact-height cleanup on unmount

Resulting behavior in `useChatMessageSender`:

- send UI policy resolves using overlay surface defaults
- screenshot capture path remains enabled by default unless config disables it
- send flow can invoke `show-chatbox` (focus false) for non-main surfaces when policy allows

Chatbox camera-toggle behavior:

- the camera button no longer captures immediately into the preview lane
- it toggles frontend config `include_query_screenshot`
- enabled state is blue and defaults to enabled on startup
- disabled state falls back to the normal icon color
- auto-capture happens only when the user sends a message from the overlay and no explicit image attachments were already provided

Send sequence in chatbox component:

1. trim input
2. bail when empty or already sending/active stream
3. clear input optimistically
4. call async `sendMessage(trimmed)`

Right-side action button parity with dashboard composer:

- camera button toggles overlay auto screenshot on/off instead of inserting a screenshot preview
- send button (`ArrowUp`) remains mounted at all times
- during active loop phases, the send button is disabled instead of becoming a local stop affordance
- active loop lock disables input, settings, screenshot, TTS, dev compaction, drag, and input auto-focus until the loop exits

Dashboard handoff affordance:

- chatbox settings icon invokes `show-main-window` with `{ maximize: true }`.
- this requests expanded dashboard view before focus handoff.

`electron:dev` compaction harness:

- when `dev_ui=1`, chatbox renders a `Run auto compaction` icon button.
- button sets optimistic compaction status text (`Compacting conversation history...`) and dispatches backend `compact-history` with payload `{ force: true }`.
- this is intended for validating compaction-status UI without waiting for token-threshold auto triggers.

## Click-Through Control Model

State inputs:

- shared `response-overlay-phase`

Behavior:

- main-process overlay phase handler owns click-through + focusable policy for both chat and response overlays
- active loop phases (`awaiting-first-chunk|streaming|tool-call|tool-output`) force click-through and `focusable=false`
- terminal phases (`complete|error|idle`) restore normal interaction

## Focus Contract

Listener:

- channel: `chatbox-focus`
- action:
  - focus input element when loop lock is not active

Non-listeners:

- chatbox no longer re-focuses from generic browser `window.focus` or `visibilitychange` events
- renderer focus behavior is explicit only: initial mount + main-process `chatbox-focus`

This is required after main-process `showChatWindow({ focus: true })`.

## Fixed Size Contract

- chat overlay window dimensions are fixed in main runtime (`createChatWindow`).
- `ChatBox.jsx` no longer emits renderer-driven resize IPC for preview or startup transitions; deprecated `set-chatbox-size` channel has been removed from preload/channel contracts.
- attachment preview uses an always-mounted preview row with class toggle (`has-items`) and opacity/translate animation.
- non-dashboard input pill now has two fixed CSS states (no live resize IPC):
  - default compact pill: no `with-preview` class (`64px` shell / `56px` pill)
  - preview-expanded pill: `with-preview` on shell/pill while image attachments exist
- compact default state centers the main control row vertically within the pill; preview-expanded state keeps controls anchored lower beneath the preview lane.
- response/typing/context-label overlays in main process use a compact visual anchor height so their vertical position follows the visible compact pill baseline instead of the full transparent chat window height.
- response/typing overlay uses a tighter chat-to-response vertical gap (`2px` in current non-dashboard main runtime) to keep the response pill visually near the chat pill.
- response overlay content now stays inside one fixed response frame (`236px`) instead of stepping the overlay height while tokens stream.
- clipboard image parsing is shared through `clipboardImageUtils.parseClipboardImageItems(...)` (also used by dashboard `MessageInput`) to keep screenshot/paste payload shape consistent across overlay and dashboard composer surfaces.
- result: no live overlay window bounds churn while typing, startup, or adding/removing images.

## Drag Movement Runtime

Drag is initiated on pill mousedown only when:

- primary button
- target is not interactive/editable

Blocked target selector includes:

- buttons/links/inputs/textboxes/contenteditable regions
- explicit `.chatbox-input-wrap` and `.chatbox-actions`

Movement path:

1. cache pointer offset from current window origin
2. on mousemove, ignore small movement (<2 px manhattan distance)
3. compute absolute target window coordinates
4. send `move-chatbox-to` with `{ x, y }`
5. stop on mouseup/window blur

## Visual Loop Activity Signal

`chatTurnPresentationState.js` is the renderer-side current-turn projection contract for the minimal pill:

- `compact`: chat pill only
- `awaiting-reply`: chat pill only
- `response`: chat pill + response overlay

`ChatBox` derives pill lock/loop state from `useCurrentTurnPresentationState(...)`, which composes the shared loop-state reducer (`useChatLoopUiState`) with one current-turn assistant-reply/surface projection helper.

`ChatBoxResponse` keeps one additional renderer-local transcript projection for the current turn:

- streamed assistant `llm-text` messages are rendered as persistent transcript blocks
- tool-call `explanation` arguments are rendered as additional transcript lines
- once the response overlay has at least one transcript entry for the current turn, it stays visible through later `tool-call` and `tool-output` phases instead of collapsing back to the pill
- pre-transcript awaiting phases do not materialize a separate response overlay window

Loop watchdog behavior:

- main-process `ipc-status` disconnect forces renderer loop UI to `idle` immediately.
- reconnect arms a short recovery watchdog; if no stream progress arrives before timeout, loop state is forced back to `idle`.
- this prevents stuck click-through/lock visuals when terminal stream events are dropped across transport reconnects.

`loop-active` CSS class is enabled when `useChatLoopUiState(...).isBusy` reports an active loop:

- `isSending === true` before the first phase event lands
- active overlay phases: `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`

## Related Tests

- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`

`ChatBoxOverlayMouseIgnore` now includes explicit anti-regression coverage for:

- startup compact-class stability (no delayed `with-preview` flip when no images exist)
- camera-toggle enabled/disabled styling and config writes without creating preview items

## Debug Checklist

If chatbox becomes permanently click-through:

1. inspect latest `response-overlay-phase` payload seen by renderer
2. verify terminal transition emits and main-process overlay phase handling restores normal interactivity
3. verify cleanup runs on unmount

If drag movement is jittery or ignored:

1. confirm mousedown target is not in blocked selector
2. inspect computed pointer offset and 2px movement threshold behavior
3. verify `move-chatbox-to` IPC reaches main process

If chatbox flickers on startup or image insert:

1. confirm `ChatBox.jsx` only toggles preview row classes and does not attempt runtime window-size mutation
2. confirm shell/pill class toggles between compact default and `with-preview` while images are present
3. confirm preview row class toggles between `chatbox-image-preview-row` and `... has-items`
4. verify fixed overlay dimensions in `main_window_runtime.cjs` match CSS fixed shell/pill heights
