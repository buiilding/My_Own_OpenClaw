---
summary: "Deep reference for minimal chat pill overlay renderer behavior: input/send lifecycle, drag movement IPC, normal hit-test intent, and visual-anchor shell-height reporting."
read_when:
  - When changing `MinimalChatPill.jsx` interaction rules or overlay input behavior.
  - When debugging chat pill focus/click-through drift, drag positioning, or startup/attachment flicker.
title: "Chatbox Overlay Input, Drag, and Click-Through Reference"
---

# Chatbox Overlay Input, Drag, and Click-Through Reference

## Canonical Modules

- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js`
- `frontend/src/renderer/app/runtime/desktopChatboxLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatboxInteractionRuntime.js`
- `frontend/src/renderer/features/minimalChatPill/components/PillIcons.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/AttachmentPreviewRow.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/app/runtime/desktopMessageSendUiRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js`
- `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`

## App Composition Boundary

`MinimalChatPillApp` renders:

- `AppProvider`
- `ChatProvider(enableTranscript=false)`
- `MinimalChatPill`

This keeps overlay window lightweight:

- no transcript writes
- no renderer-side tool-dispatch listeners
- the pill still sends queries through `useChatMessageSender(...)`, which calls
  SDK-backed Electron IPC

## Send Path and Overlay Surface Policy

`MinimalChatPill` calls:

- `useChatMessageSender(undefined, { senderSurface: "overlay-chatbox" })`
- `useChatSurfaceController(...)`, which derives loop lock from SDK
  `currentTurnProjection` plus the local pre-SDK send latch.

`useMinimalChatPillBindings` encapsulates chat pill runtime effect bindings:

- explicit focus lifecycle through `DesktopWindowRuntimeClient` + mount focus
- text-input DOM focus and caret placement through
  `DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd(...)`; the pill
  keeps only its text-entry active state
- wakeword STT trigger handling through `DesktopWindowRuntimeClient`
- global drag window listeners through `DesktopChatboxInteractionRuntime`
- pointer hit-test listeners and pill-bounds checks through
  `DesktopChatboxInteractionRuntime`
- close-button anchor measurement, resize listener wiring, `ResizeObserver`,
  and animation-frame scheduling through `DesktopChatboxInteractionRuntime`
- visual-anchor sync through `DesktopChatboxInteractionRuntime`, which owns
  `ResizeObserver`, debounce timer, animation-frame scheduling, and
  `DesktopWindowRuntimeClient` anchor-height reporting from measured shell
  height plus compact-height cleanup on unmount
- native-frame collapse timeout scheduling and post-presize composer height
  animation-frame commits through `DesktopChatboxInteractionRuntime`
- text-entry activation reason reporting through `DesktopWindowRuntimeClient`;
  the runtime client assembles the host-shaped `{ reason }` IPC payload

Resulting behavior in `useChatMessageSender`:

- send UI policy resolves using overlay surface defaults
- screenshot capture path remains enabled by default unless config disables it
- send flow can invoke `show-chatbox` (focus false) for non-main surfaces when policy allows

Minimal pill control inventory in current production `MinimalChatPill`:

- the chat pill shell now owns a bumped top contour that houses the close control as part of one silhouette
- settings button opens the dashboard/chat surface via
  `DesktopWindowRuntimeClient.showMainWindowWithValues(...)`; the runtime
  client assembles the host-shaped main-window options
- attachment button opens the native file picker for image/file attachments
- screenshot button toggles overlay auto screenshot (`include_query_screenshot`)
- sound button toggles text-to-speech replies (`speech_mode_enabled`)
- send button submits the current text/attachment payload
- when `dev_ui=1`, an additional `Run auto compaction` button appears between settings and attachments

Chatbox camera-toggle behavior:

- the camera button no longer captures immediately into the preview lane
- it toggles renderer config `include_query_screenshot`
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

- chatbox settings icon invokes `DesktopWindowRuntimeClient.showMainWindowWithValues(...)`
  with the chat open-target, maximize value, and handoff reason.
- this requests expanded dashboard view before focus handoff while keeping
  host-shaped window option assembly in the runtime client.

`electron:dev` compaction harness:

- when `dev_ui=1`, chatbox renders a `Run auto compaction` icon button.
- button delegates to the shared manual compaction runtime, which sets
  optimistic compaction status text (`Compacting conversation history...`),
  rehydrates the active conversation through the normalized store path when a
  conversation ref exists, then asks `DesktopConversationContinuityService` to run
  SDK conversation-runtime compaction with payload `{ force: true }`. The
  SDK desktop transport adapter maps that SDK command to backend `compact-history`.
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
  - mark text entry active and focus the input at the current text end through
    `DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd(...)` when
    loop lock is not active

Non-listeners:

- chatbox no longer re-focuses from generic browser `window.focus` or `visibilitychange` events
- renderer focus behavior is explicit only: initial mount + main-process `chatbox-focus`

This is required after main-process `showChatWindow({ focus: true })`.

## Fixed Size Contract

- chat overlay window dimensions are still owned by the Electron main window runtime (`createChatWindow`), but the native frame is now preallocated instead of resizing on each multiline anchor update.
- `ChatBox.jsx` no longer emits renderer-driven freeform resize IPC for preview/startup transitions; deprecated `set-chatbox-size` channel has been removed from preload/channel contracts.
- renderer now measures `.chatbox-shell` with `ResizeObserver` and reports the resulting visual-anchor height through `DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(...)`, so multiline composer growth can enlarge the lower pill body while main re-anchors response/context overlays without resizing the native chat window itself. The window runtime client assembles the underlying `height` / optional `frameHeight` IPC payload.
- `.chatbox-shell` reserves explicit top bump headroom, and the chat pill consumes that space for its integrated close-button bump so the mutated shell contour stays inside the native overlay window even when multiline composer growth pushes the lower pill body taller.
- idle chatbox hover now reports a dedicated main-process hit-test state, allowing the transparent overlay window to stay click-through outside the visible pill shape while preserving direct interaction over the pill and close bump.
- attachment preview uses an always-mounted preview row with class toggle (`has-items`) and opacity/translate animation.
- non-dashboard input pill still has deterministic CSS baselines and no separate resize channel:
  - default compact pill: no `with-preview` class (`64px` anchor fallback / `56px` pill)
  - preview-expanded pill: `with-preview` on shell/pill while image attachments exist (`116px` anchor fallback)
  - multiline composer growth can exceed those fallback heights because the measured shell height becomes the live visual anchor
- multiline resize reporting is batched to one animation-frame commit so the main process sees the settled shell height instead of intermediate `ResizeObserver` steps, and main uses that anchor only for overlay re-positioning while the native chat frame stays fixed.
- the delayed native-frame collapse after empty composer shrinkage is scheduled
  through `DesktopChatboxInteractionRuntime`; `MinimalChatPill` owns only the
  empty-input/attachment guard and the anchor height values it reports.
- manual drag persistence now stores the dragged bottom edge rather than the raw overlay top-left `y`, so vertical dragging still works while multiline/preview growth continues to move upward from the same visual baseline.
- response/typing overlays in main process use the reported chat visual anchor height so their vertical position follows the visible pill baseline instead of the full transparent chat window height.
- response/typing overlay uses a tighter chat-to-response vertical gap (`2px` in the current non-dashboard Electron main overlay runtime) to keep the response pill visually near the chat pill.
- response overlay content now stays inside one fixed response frame (`236px`) instead of stepping the overlay height while tokens stream.
- clipboard image parsing is shared through `desktopComposerAttachmentRuntime.parseClipboardImageItems(...)` (also used by dashboard `MessageInput`) to keep screenshot/paste payload shape consistent across overlay and dashboard composer surfaces.
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

1. begin drag through `DesktopChatboxLayoutRuntime.startChatboxDragFromWindow(...)`
   so current `window.screenX/screenY` reads stay inside the layout runtime
2. cache pointer offset from current window origin
3. on mousemove, ignore small movement (`<5px` Manhattan distance) through
   `DesktopChatboxLayoutRuntime.getChatboxDragTarget(...)`
4. once the threshold is crossed, mark the gesture as a real drag
5. compute absolute target window coordinates
6. call `DesktopWindowRuntimeClient.moveChatboxTo({ x, y })`
7. stop on mouseup/window blur through `DesktopChatboxInteractionRuntime`

Hit-test path:

1. `DesktopChatboxInteractionRuntime` subscribes to pointer leave, blur, and
   mousemove browser events for the pill window.
2. the runtime compares pointer coordinates with the current pill bounds.
3. `MinimalChatPill` receives a boolean active state, dedupes it, and reports
   it through `DesktopWindowRuntimeClient.setChatboxHitTestActiveValue(...)`
   plus renderer trace value logging.

Close-anchor path:

1. `DesktopChatboxInteractionRuntime` schedules close-anchor measurement on the
   next animation frame.
2. the runtime listens for window resize and pill `ResizeObserver` callbacks,
   then remeasures the send button center relative to the pill bounds.
3. `MinimalChatPill` supplies refs and an anchor snapshot while the runtime
   writes `--chatbox-close-center-x` only when the resolved center changes.

## Visual Loop Activity Signal

`desktopCurrentTurnPresentationRuntime.js` is the renderer-side current-turn projection contract for the minimal pill:

- `compact`: chat pill only
- `awaiting-reply`: chat pill + typing indicator
- `response`: chat pill + response overlay

`ChatBox` derives pill lock/loop state from `useChatSurfaceController(...)`,
which applies `DesktopVisibleTurnLifecycleRuntime` to the message-only
presentation snapshot from `DesktopCurrentTurnPresentationRuntime`.

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

- SDK `currentTurnProjection.phase` is active
- `isSending === true` before the SDK current-turn projection opens

## Related Tests

- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/LiveTurnSurfaceState.test.js`

`ChatBoxOverlayMouseIgnore` now includes explicit anti-regression coverage for:

- startup compact-class stability (no delayed `with-preview` flip when no images exist)
- multiline shell growth updating `DesktopWindowRuntimeClient.setChatboxVisualAnchorHeight(...)` without reviving deprecated `set-chatbox-size`
- camera-toggle enabled/disabled styling and config writes without creating preview items
- drag-from-input and drag-from-button behavior after the private `5px` movement threshold
- normal button clicks still firing when no drag threshold crossing occurs

## Debug Checklist

If chatbox becomes permanently click-through:

1. inspect latest `response-overlay-phase` payload seen by renderer
2. verify terminal transition emits and main-process overlay phase handling restores normal interactivity
3. verify cleanup runs on unmount

If drag movement is jittery or ignored:

1. inspect computed pointer offset and `5px` movement threshold behavior
2. confirm click-capture suppression only happens after `didDrag === true`
3. verify `DesktopWindowRuntimeClient.moveChatboxTo(...)` reaches main process

If chatbox flickers on startup or image insert:

1. confirm `ChatBox.jsx` only toggles preview row classes and does not attempt runtime window-size mutation
2. confirm shell/pill class toggles between compact default and `with-preview` while images are present
3. confirm preview row class toggles between `chatbox-image-preview-row` and `... has-items`
4. verify fixed overlay dimensions in `main_window_runtime.cjs` match CSS fixed shell/pill heights
