---
summary: "Minimal chat pill guide covering chatbox renderer, overlay window behavior, send/capture policy, drag/anchor behavior, and Linux screenshot timing."
read_when:
  - When changing the floating chat pill, overlay input, screenshot send path, drag sizing, or minimal chat state machine.
  - When debugging flicker, click-through, or capture timing.
title: "Minimal Chat Pill"
---

# Minimal Chat Pill

The minimal chat pill is the small always-available desktop command surface. It is rendered by React, positioned and focused by Electron main, and participates in the same backend query/tool loop as the dashboard.

## Main Files

- Renderer app: `frontend/src/renderer/app/ChatBoxApp.jsx`
- Component: `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- Bindings: `frontend/src/renderer/features/chat/hooks/useChatBoxBindings.js`
- Composer state: `frontend/src/renderer/features/chat/hooks/useChatComposerDraft.js`
- Message sending: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- Selectors: `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- Main window/visibility: `frontend/src/main/main_window_runtime.cjs`, `window_visibility_runtime.cjs`, `overlay_chatbox_handler.cjs`

## Behavior Contracts

- The pill is a command surface, not a separate chat backend session.
- Closing the pill is durable user intent. Generic lifecycle paths such as
  startup-surface reapply or app activation must not reopen it while that intent
  is set.
- Intentional summons such as wakeword detection, the global hotkey, and
  dashboard-close handoff may reopen the pill and clear the user-hidden intent.
- Screenshot capture behavior differs by platform; Linux hides WindieOS overlays, Windows/macOS do not.
- Drag and resize behavior should preserve the user-perceived anchor, especially when multiline input or image previews grow.
- The pill should avoid focus stealing unless explicitly requested.
- The response overlay phase must stay synchronized with the pill's awaiting/streaming state.

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
- do not animate awaiting-to-response transitions in the minimal pill loop
- Linux is the only OS that should hide WindieOS overlay surfaces for screenshot
  capture and restore them after capture
- Windows and macOS must not add capture-time hide/show for the minimal chat
  pill or response overlay
- Windows and macOS should enable overlay `setContentProtection(true)` only
  during active loop phases (`awaiting-first-chunk`, `streaming`, `tool-call`,
  `tool-output`) and disable it again for idle and terminal phases

## Deep Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Chatbox Overlay Input, Drag, and Click-Through Reference](../frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
