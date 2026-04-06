---
summary: "Deep reference for chatbox overlay renderer behavior: input/send lifecycle, click-through toggling, drag movement IPC, and visual-anchor shell-height reporting."
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
- visual-anchor IPC sync from measured shell height plus compact-height cleanup on unmount

Resulting behavior in `useChatMessageSender`:

- send UI policy resolves using overlay surface defaults
- screenshot capture path remains enabled by default unless config disables it
- send flow can invoke `show-chatbox` (focus false) for non-main surfaces when policy allows

Minimal pill control inventory in current production `ChatBox`:

- the chat pill shell now owns a bumped top contour that houses the close control as part of one silhouette
- settings button opens the dashboard/chat surface via `show-main-window`
- attachment button opens the native file picker for image/file attachments
- screenshot button toggles overlay auto screenshot (`include_query_screenshot`)
- sound button toggles text-to-speech replies (`speech_mode_enabled`)
- send button submits the current text/attachment payload
- when `dev_ui=1`, an additional `Run auto compaction` button appears between settings and attachments

Chatbox camera-toggle behavior:

- the camera button no longer captures immediately into the preview lane
- it toggles frontend config `include_query_screenshot`
- enabled state is blue and defaults to enabled on startup
- enabled hover keeps the icon blue; hover only changes the button background
- disabled state falls back to the normal white icon color
- disabled hover keeps the icon white; hover only changes the button background
- auto-capture happens only when the user sends a message from the overlay and no explicit image attachments were already provided

Send sequence in chatbox component:

1. trim input
2. bail when empty or already sending/active stream
3. clear input optimistically
4. call async `sendMessage(trimmed)`

Right-side action button parity with dashboard composer:

- camera button toggles overlay auto screenshot on/off instead of inserting a screenshot preview
- sound button toggles text-to-speech on/off for overlay-originated turns and uses the same enabled-state styling pattern as the dashboard speech toggle
- screenshot and sound toggles share the same visual contract: enabled = blue icon at rest and on hover; disabled = white icon at rest and on hover
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
- terminal phases (`complete|error|idle`) restore normal interaction for the visible pill shell, but idle chatbox hit-testing now defaults to click-through until the renderer reports pointer hover over the actual pill/bump

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

- chat overlay window dimensions are still owned by main runtime (`createChatWindow`), but the native frame is now preallocated instead of resizing on each multiline anchor update.
- `ChatBox.jsx` no longer emits renderer-driven freeform resize IPC for preview/startup transitions; deprecated `set-chatbox-size` channel has been removed from preload/channel contracts.
- renderer now measures `.chatbox-shell` with `ResizeObserver` and reports the resulting visual-anchor height through `set-chatbox-visual-anchor-height`, so multiline composer growth can enlarge the lower pill body while main re-anchors response/context overlays without resizing the native chat window itself.
- `.chatbox-shell` reserves explicit top bump headroom, and the chat pill consumes that space for its integrated close-button bump so the mutated shell contour stays inside the native overlay window even when multiline composer growth pushes the lower pill body taller.
- idle chatbox hover now reports a dedicated main-process hit-test state, allowing the transparent overlay window to stay click-through outside the visible pill shape while preserving direct interaction over the pill and close bump.
- attachment preview uses an always-mounted preview row with class toggle (`has-items`) and opacity/translate animation.
- non-dashboard input pill still has deterministic CSS baselines and no separate resize channel:
  - default compact pill: no `with-preview` class (`64px` anchor fallback / `56px` pill)
  - preview-expanded pill: `with-preview` on shell/pill while image attachments exist (`116px` anchor fallback)
  - multiline composer growth can exceed those fallback heights because the measured shell height becomes the live visual anchor
- multiline resize reporting is batched to one animation-frame commit so the main process sees the settled shell height instead of intermediate `ResizeObserver` steps, and main uses that anchor only for overlay re-positioning while the native chat frame stays fixed.
- manual drag persistence now stores the dragged bottom edge rather than the raw overlay top-left `y`, so vertical dragging still works while multiline/preview growth continues to move upward from the same visual baseline.
- response/typing/context-label overlays in main process use the reported chat visual anchor height so their vertical position follows the visible pill baseline instead of the full transparent chat window height.
- response/typing overlay uses a tighter chat-to-response vertical gap (`2px` in current non-dashboard main runtime) to keep the response pill visually near the chat pill.
- response overlay content now stays inside one fixed response frame (`236px`) instead of stepping the overlay height while tokens stream.
- clipboard image parsing is shared through `clipboardImageUtils.parseClipboardImageItems(...)` (also used by dashboard `MessageInput`) to keep screenshot/paste payload shape consistent across overlay and dashboard composer surfaces.
- result: main still owns the native window bounds, but multiline typing and preview growth now move the whole chat/response stack upward through one anchor-height contract instead of a separate resize IPC.

## Drag Movement Runtime

Drag is initiated from any visible pill region on mousedown when:

- primary button
- loop lock is not active

Interaction contract:

- buttons/icons and the text input all participate in the same tentative drag start
- movement below the drag threshold is treated as a normal click/focus interaction
- movement beyond the drag threshold upgrades the gesture into window drag and suppresses the later click event
- result: the pill is easy to grab from anywhere without turning every tap into a drag

Movement path:

1. cache pointer offset from current window origin
2. on mousemove, ignore small movement (`<5px` manhattan distance)
3. once the threshold is crossed, mark the gesture as a real drag
4. compute absolute target window coordinates
5. send `move-chatbox-to` with `{ x, y }`
6. stop on mouseup/window blur

## Visual Loop Activity Signal

`chatTurnPresentationState.js` is the renderer-side current-turn projection contract for the minimal pill:

- `compact`: chat pill only
- `awaiting-reply`: chat pill + typing indicator
- `response`: chat pill + response overlay

`ChatBox` derives pill lock/loop state from `useCurrentTurnPresentationState(...)`, which composes the shared loop-state reducer (`useChatLoopUiState`) with one current-turn assistant-reply/surface projection helper.

`ChatBoxResponse` keeps one additional renderer-local transcript projection for the current turn:

- streamed assistant `llm-text` messages are rendered as persistent transcript blocks
- tool-call `explanation` arguments are rendered as additional transcript lines
- once the response overlay has at least one transcript entry for the current turn, it stays visible through later `tool-call` and `tool-output` phases instead of falling back to the typing indicator
- the typing indicator is now only the pre-transcript state (before any current-turn assistant text or tool explanation exists)

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
- multiline shell growth updating `set-chatbox-visual-anchor-height` without reviving deprecated `set-chatbox-size`
- camera-toggle enabled/disabled styling and config writes without creating preview items
- drag-from-input and drag-from-button behavior after the shared `5px` threshold
- normal button clicks still firing when no drag threshold crossing occurs

## Debug Checklist

If chatbox becomes permanently click-through:

1. inspect latest `response-overlay-phase` payload seen by renderer
2. verify terminal transition emits and main-process overlay phase handling restores normal interactivity
3. verify cleanup runs on unmount

If drag movement is jittery or ignored:

1. inspect computed pointer offset and `5px` movement threshold behavior
2. confirm click-capture suppression only happens after `didDrag === true`
3. verify `move-chatbox-to` IPC reaches main process

If chatbox flickers on startup or image insert:

1. confirm `ChatBox.jsx` only toggles preview row classes and does not attempt runtime window-size mutation
2. confirm shell/pill class toggles between compact default and `with-preview` while images are present
3. confirm preview row class toggles between `chatbox-image-preview-row` and `... has-items`
4. verify fixed overlay dimensions in `main_window_runtime.cjs` match CSS fixed shell/pill heights
