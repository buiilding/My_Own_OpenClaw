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
- `frontend/src/renderer/features/chat/components/ChatBoxIcons.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxImagePreviewRow.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/utils/clipboardImageUtils.js`
- `frontend/src/renderer/features/chat/utils/overlayPhaseListener.js`
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

Resulting behavior in `useChatMessageSender`:

- send UI policy resolves using overlay surface defaults
- screenshot capture path remains enabled by default unless config disables it
- send flow can invoke `show-chatbox` (focus false) for non-main surfaces when policy allows

Send sequence in chatbox component:

1. trim input
2. bail when empty or already sending
3. clear input optimistically
4. call async `sendMessage(trimmed)`

Dashboard handoff affordance:

- chatbox settings icon invokes `show-main-window` with `{ maximize: true }`.
- this requests expanded dashboard view before focus handoff.

`electron:dev` compaction harness:

- when `dev_ui=1`, chatbox renders a `Run auto compaction` icon button.
- button dispatches backend `compact-history` with payload `{ force: true }`.
- this is intended for validating compaction-status UI without waiting for token-threshold auto triggers.

## Click-Through Control Model

State inputs:

- `streamPhase` from chat store
- `overlayPhase` from `response-overlay-phase` channel

Constants:

- click-through candidate phases:
  - `awaiting-first-chunk`
  - `streaming`
  - `tool-call`
  - `tool-output`
- terminal phases:
  - `idle`
  - `complete`
  - `error`

Behavior:

- component invokes `set-overlay-ignore-mouse` with dedupe ref guard
- non-terminal active phases set ignore to `true`
- terminal/idle states set ignore to `false`
- cleanup restores interactive mode (`ignore=false`)

## Focus Contract

Listener:

- channel: `chatbox-focus`
- action:
  - force `ignore=false`
  - focus input element

This is required after main-process `showChatWindow({ focus: true })`.

## Fixed Size Contract

- chat overlay window dimensions are fixed in main runtime (`createChatWindow`).
- `ChatBox.jsx` no longer emits renderer-driven resize IPC for preview or startup transitions; deprecated `set-chatbox-size` channel has been removed from preload/channel contracts.
- attachment preview uses an always-mounted preview row with class toggle (`has-items`) and opacity/translate animation.
- non-dashboard input pill now has two fixed CSS states (no live resize IPC):
  - default compact pill: no `with-preview` class (`64px` shell / `56px` pill)
  - preview-expanded pill: `with-preview` on shell/pill while image attachments exist
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

`loop-active` CSS class is enabled when either:

- `streamTracking.phase` in active loop set, or
- `overlayPhase` in active loop set

Active loop phases:

- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`

## Related Tests

- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`

## Debug Checklist

If chatbox becomes permanently click-through:

1. inspect latest `response-overlay-phase` payload seen by renderer
2. verify terminal transition emits and `set-overlay-ignore-mouse(false)` fires
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
