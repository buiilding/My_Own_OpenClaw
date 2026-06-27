---
summary: "Response overlay guide covering SDK current-turn display, awaiting shell, tool ghost preview, close behavior, window synchronization, and the minimalChatPill useResponseOverlayViewModel owner."
read_when:
  - When changing response overlay rendering, SDK current-turn projection, tool ghost previews, or close/visibility policy.
  - When debugging dashboard/pill/response overlay state drift.
  - When changing or searching for `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`.
title: "Response Overlay"
---

# Response Overlay

The response overlay displays live assistant output and transient tool/progress state outside the dashboard. It is coupled to the chat pill turn lifecycle but has its own renderer root and window controls.

## Main Files

- Renderer app: `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- Component: `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- View model: `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- Window sync: `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js`
- Scroll state: `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayScrollState.js`
- Browser interaction runtime: `frontend/src/renderer/app/runtime/desktopResponseOverlayInteractionRuntime.js`
- Phase contracts: `frontend/src/shared/response_overlay_phase_contract.json`, `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`, `frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`
- Main handler: `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`

## Runtime Model

The renderer view model receives selector-projected `chatSurfaceState` and
prefers SDK `ConversationView` live-turn/surface state when present. Raw
`currentTurnProjection` is only part of that selector-projected fallback before
the normal view exists:

- `phase` decides awaiting/streaming/tool/terminal presentation
- `assistantText` and `toolEvents` decide response content
- `reasoningText` decides thinking copy

When a `ConversationView` exists, the overlay transcript reads same-turn
materialized `displayRows` first and appends only live-turn entries not already
represented by those rows. This keeps tool call/output cards visible in the
floating overlay without reintroducing duplicate tool rows into the dashboard.

Main process phase updates control native response-window visibility. They do
not decide renderer typing state, response content, closeability, stop/busy
state, click-through/focusability, or screenshot content protection.

Electron main applies a surface-ownership gate before showing the native
response overlay. The floating response overlay may show only when the chat pill
is the primary visible surface. When the dashboard or onboarding window owns
presentation, SDK current-turn content remains available to the dashboard, but
the floating response overlay and its typing shell stay hidden.

In light appearance, the response-overlay typing shell and dots must route
through appearance foreground-backed tokens so the awaiting state remains
readable against light desktop surfaces.

Click-through/focusability and screenshot content protection are scoped to SDK
local tool lifecycle leases in Electron main.

Response overlay hit-test state is reported by the renderer through
`DesktopResponseOverlayInteractionRuntime`, which owns browser pointer
subscriptions and shell-bounds checks before the component reports the boolean
state through the response overlay runtime client.

## Tool Ghost

Tool ghost previews visualize target/action intent during local computer-use
flows. Keep preview parsing and target mapping in renderer overlay utilities,
and keep actual execution in local-runtime tools.

## Deep Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Response Overlay Phase and Tool-Ghost Runtime Reference](../frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Frontend Overlay + Wakeword Control Channel Reference](../frontend/contracts/overlay_and_wakeword_control_channel_reference.md)
- [Frontend Runtime Invariants and PR Checklist](../frontend/runtime/frontend_runtime_invariants_checklist.md)
