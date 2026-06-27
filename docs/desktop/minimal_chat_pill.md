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
- Browser interaction runtime: `frontend/src/renderer/app/runtime/desktopChatboxInteractionRuntime.js`
- Composer state: `frontend/src/renderer/features/chat/hooks/useChatComposerDraft.js`
- Message sending: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- Selectors: `frontend/src/renderer/features/chat/stores/chatStore.ts`, with
  projection rules in
  `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`
- Main window/visibility: `frontend/src/main/surfaces/main_window_runtime.cjs`, `window_visibility_runtime.cjs`, `overlay_chatbox_handler.cjs`

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
- Normal desktop startup must still present a visible surface. If durable hidden
  intent suppresses the startup pill request, startup opens the dashboard
  instead of leaving the app with no visible surface.
- Intentional summons such as wakeword detection, the global hotkey, and
  dashboard-close handoff may reopen the pill and clear the user-hidden intent.
- Screenshot capture behavior differs by platform; Linux hides desktop overlay surfaces, Windows/macOS do not.
- Drag and resize behavior should preserve the user-perceived anchor, especially when multiline input or image previews grow.
- In light appearance, the close badge foreground must resolve through the
  active appearance foreground token so the close affordance stays readable on
  the pill's light close bump.
- The compact pill side caps are drawn by a real rounded body layer, with the
  close bump drawn as a separate decorative layer behind it. The main left and
  right ends should not depend on a whole-shell polygon approximation, and the
  bump layer must use a small lower rounded bell-curve tab profile so it cannot
  brighten or paint over the pill body or read as a dome or peaked tent. The
  tab surface and outline must use the same panel background and border tokens
  as the pill body, and the close badge must not draw a rectangular seam cover
  that creates a flat shelf under the tab.
  The pill body shadow should stay subtle enough that it does not create a
  visible gray halo on white backgrounds. The compact state keeps true pill
  caps, while measured multiline composer growth switches to a smaller finite
  top radius and compact-matching bottom radius so the surface keeps
  rounded-rectangle corners with vertical sides instead of turning into an
  oval or changing the lower corner contour.
- Press-and-hold dragging is a shell interaction, not text entry. The first
  unfocused press on the textarea may request native text-entry activation for
  click-to-type, but if the pointer moves past the drag threshold that same
  gesture must drag the pill without requiring a prior focus click.
- The pill should avoid focus stealing unless explicitly requested.
- SDK current-turn presentation owns whether the pill shows typing or response
  content. The response overlay phase stays synchronized as BrowserWindow shell
  policy, not as a second source of content state.
- SDK current-turn presentation is also the live content source for the
  dashboard. The dashboard and floating response overlay both project SDK
  presentation entries into normal chat messages and render them through the
  shared chat message components. The response overlay may be smaller and
  windowed, but it must not maintain a parallel markdown, thinking, tool-call,
  or source-badge renderer.
- The floating response overlay is gated by Electron main surface ownership. It
  may show only while the chat pill is the primary visible surface; dashboard
  and onboarding ownership suppress the overlay and typing shell while preserving
  SDK current-turn state for inline dashboard rendering. Opening the dashboard
  during an active loop should therefore hide the native overlay shell while the
  same live content continues streaming inline in the dashboard.
- After the user accepts a send from the pill, the pill must immediately latch
  the local busy/Stop state and clear stale current-turn presentation before the
  shared async send preparation resolves the active conversation. The shared
  send path still owns the optimistic user row, conversation ref, resources, and
  SDK dispatch.
- The send path accepts a pending turn immediately and emits
  `windie:pending-turn` to Electron main. Main stores, broadcasts, and replays
  that pending user row so sibling renderer windows keep the optimistic row and
  busy state until the matching SDK current-turn projection arrives or the turn
  is explicitly cleared after send failure.
- User-provided image attachments that already exist in the composer are passed
  as SDK turn resources while the pending bridge carries only identity, text,
  and timestamp. The dashboard should render visual attachments from SDK
  `attachments[]` display rows once resource materialization projects them, not
  from renderer-owned inline screenshot descriptors or filename metadata on the
  pending row. Auto-capture screenshots follow the same SDK resource path and
  render after SDK materialization emits artifact-backed screenshot metadata.
- The response overlay renderer resolves local pre-SDK waiting from pending-turn
  and chat state, not from a renderer-invoked phase override. Hidden or idle SDK
  startup projections must not clear the pending-turn presentation; active SDK
  awaiting/response or terminal send failure supersedes it.
- Pill response-overlay turn identity is resolved by
  `DesktopChatPillSessionRuntime` from SDK response entries, SDK overlay intent,
  visible lifecycle, or the pending bridge. React hooks pass those surface
  inputs through instead of rebuilding their own turn-ref fallback chains.
- `prime-response-overlay-awaiting` / `renderer-send-preflight` are removed from
  the current send preflight path. The first native response window show for
  typing still comes from the renderer's measured `set-responsebox-size` report,
  while backend/SDK current-turn projection remains the authority for active
  assistant/tool response phases.
- Preflight typing is not durable chat state. It exists only to cover the gap
  between user acceptance and SDK current-turn publication, and must be cleared
  or superseded by SDK projection rather than stored as transcript, replay, or
  backend stream state.
- Stop from the pill must preserve the active SDK current-turn id when one is
  available. The renderer may still send a null turn id during the pre-stream
  send latch, but it must not discard an existing current-turn id. Stop must
  also prefer the visible SDK current-turn conversation ref over the renderer
  session fallback and clear busy, thinking, and stream-tracking state on that
  same conversation ref so typing indicators cannot survive after backend
  cancellation succeeds.
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
- Linux is the only OS that should hide desktop overlay surfaces for screenshot
  capture and restore them after capture
- Windows and macOS must not add capture-time hide/show for the chat pill or
  response overlay
- Windows and macOS should enable overlay `setContentProtection(true)` only
  during active screenshot capture and disable it immediately after capture

## Tool Surface Leases

The SDK owns local tool execution order and calls Electron's
`localToolLifecycle.beforeExecute(call)` immediately before local-runtime execution.
Electron main owns the BrowserWindow policy that hook applies:

- `mouse_control` / `scroll_control`: show the pill on top, make the pill and
  response overlay click-through and non-focusable, run the local tool through
  the SDK local runtime, then restore normal pill and response-overlay hit-test
  and focusability policy
  without stealing focus.
- `screenshot`: apply screenshot protection before capture, run the local
  runtime screenshot, then restore the prior policy. Linux hides visible desktop
  surfaces; macOS and Windows use content protection.

The renderer does not apply native click-through timing or screenshot
invisibility. It renders the pill and response overlay, sends user text,
displays the current-turn projection, handles drag intent through renderer
app-runtime interaction adapters, and reports normal hit-test intent. Pointer
hit-test subscriptions and pill-bounds checks route through
`DesktopChatboxInteractionRuntime`; the component reports only deduped boolean
active state and trace values. Close-button anchor measurement, resize
subscriptions, `ResizeObserver`, and animation-frame scheduling also route
through that runtime so the component supplies only the pill/send-button refs
and anchor snapshot. Native-frame collapse timeout scheduling and the
post-presize composer-height animation-frame commit also route through
`DesktopChatboxInteractionRuntime`, leaving the component with only the
empty-input/attachment policy and anchor values.

## Deep Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Chatbox Overlay Input, Drag, and Click-Through Reference](../frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Frontend Message Send Surface Policy and Screenshot Capture](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
