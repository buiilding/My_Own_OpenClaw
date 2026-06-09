---
summary: "Chat pill guide covering the minimal pill renderer, overlay window behavior, send/capture policy, drag/anchor behavior, and Linux screenshot timing."
read_when:
  - When changing the floating chat pill, overlay input, screenshot send path, drag sizing, or chat state machine.
  - When debugging flicker, click-through, or capture timing.
title: "Chat Pill"
---

# Chat Pill

The chat pill is the small always-available desktop command surface. It is rendered by React, positioned and focused by Electron main, and participates in the same backend query/tool loop as the dashboard.

## Main Files

- Renderer app: `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- Component: `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- Response renderer app: `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- Response component: `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- Bindings: `frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js`
- Composer state: `frontend/src/renderer/features/chat/hooks/useChatComposerDraft.js`
- Message sending: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- Selectors: `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- Main window/visibility: `frontend/src/main/main_window_runtime.cjs`, `window_visibility_runtime.cjs`, `overlay_chatbox_handler.cjs`

## Behavior Contracts

- The pill is a command surface, not a separate chat backend session.
- The active overlay routes are `?view=minimal-chat-pill` for the pill and
  `?view=minimal-response-overlay` for the response overlay.
- The current UI implementation was preserved and moved under
  `features/minimalChatPill/`; old `ChatBox` names in CSS or IPC contracts are
  legacy transport/style names, not feature ownership.
- Closing the pill is durable user intent. Generic lifecycle paths such as
  startup-surface reapply or app activation must not reopen it while that intent
  is set.
- Intentional summons such as wakeword detection, the global hotkey, and
  dashboard-close handoff may reopen the pill and clear the user-hidden intent.
- Screenshot capture behavior differs by platform; Linux hides WindieOS overlays, Windows/macOS do not.
- Drag and resize behavior should preserve the user-perceived anchor, especially when multiline input or image previews grow.
- The pill should avoid focus stealing unless explicitly requested.
- SDK current-turn presentation owns whether the pill shows typing or response
  content. The response overlay phase stays synchronized as BrowserWindow shell
  policy, not as a second source of content state.
- The floating response overlay is gated by Electron main surface ownership. It
  may show only while the chat pill is the primary visible surface; dashboard
  and onboarding ownership suppress the overlay and typing shell while preserving
  SDK current-turn state for inline dashboard rendering.
- Active agent turns do not make the pill click-through by themselves. Electron
  main applies click-through only through the SDK `localToolLifecycle` pointer
  lease around `mouse_control` and `scroll_control`, then restores the pill
  hit-test policy in `finally`.
- The floating response overlay uses the same normal hit-test model as the
  pill: the native response window starts click-through, the renderer reports
  pointer-in-response-shell intent, and Electron main flips the BrowserWindow
  interactive only while the pointer is inside the rendered response surface.
- Screenshot invisibility is also lease-scoped. Electron main applies the
  capture policy immediately around SDK-local `screenshot` execution and
  restores the window policy in `finally`.

## Linux Flicker Contract

For Linux screenshot capture:

- use hide-only collapse via `hide-chatbox`
- do not pre-hide with `show-chatbox`
- latch awaiting state from shared `response-overlay-phase` values:
  `tool-call`, `tool-output`, and `awaiting-first-chunk`
- keep the awaiting latch through transient `idle`
- clear the latch on `streaming`, `complete`, `error`, or visible response
  content
- mount the typing indicator in a stable awaiting shell
- do not animate awaiting-to-response transitions in the chat pill loop
- Linux is the only OS that should hide WindieOS overlay surfaces for screenshot
  capture and restore them after capture
- Windows and macOS must not add capture-time hide/show for the chat pill or
  response overlay
- Windows and macOS should enable overlay `setContentProtection(true)` only
  during active screenshot capture and disable it immediately after capture

## Tool Surface Leases

The SDK owns local tool execution order and calls Electron's
`localToolLifecycle.beforeExecute(call)` immediately before sidecar execution.
Electron main owns the BrowserWindow policy that hook applies:

- `mouse_control` / `scroll_control`: show the pill on top, make the pill and
  response overlay click-through and non-focusable, run the sidecar tool, then
  restore normal pill and response-overlay hit-test and focusability policy
  without stealing focus.
- `screenshot`: apply screenshot protection before capture, run the sidecar
  screenshot, then restore the prior policy. Linux hides visible WindieOS
  surfaces; macOS and Windows use content protection.

The renderer does not apply native click-through timing or screenshot
invisibility. It renders the pill and response overlay, sends user text,
displays the current-turn projection, handles dragging, and reports normal
hit-test intent.

## Deep Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Chatbox Overlay Input, Drag, and Click-Through Reference](../frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
