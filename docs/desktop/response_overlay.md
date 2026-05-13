---
summary: "Response overlay guide covering phase state, streamed output, awaiting shell, tool ghost preview, close behavior, and window synchronization."
read_when:
  - When changing response overlay rendering, phase transitions, tool ghost previews, or close/visibility policy.
  - When debugging overlay phase desynchronization.
title: "Response Overlay"
---

# Response Overlay

The response overlay displays live assistant output and transient tool/progress state outside the dashboard. It is coupled to the chat pill turn lifecycle but has its own renderer root and window controls.

## Main Files

- Renderer app: `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- Component: `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- Phase hook: `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- View model: `frontend/src/renderer/features/chat/hooks/useResponseOverlayViewModel.js`
- Window sync: `frontend/src/renderer/features/chat/hooks/useResponseOverlayWindowSync.js`
- Scroll state: `frontend/src/renderer/features/chat/hooks/useResponseOverlayScrollState.js`
- Phase contracts: `frontend/src/shared/response_overlay_phase_contract.json`, `frontend/src/renderer/features/chat/utils/overlay/*`
- Main handler: `frontend/src/main/response_overlay_phase_handler.cjs`

## Phase Model

Important phases include:

- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`
- `idle`

The renderer should derive display from phase plus current messages, not from ad hoc timers. Main process phase updates control overlay visibility and content protection.

## Tool Ghost

Tool ghost previews visualize target/action intent during local computer-use flows. Keep preview parsing and target mapping in renderer overlay utilities, and keep actual execution in sidecar tools.

## Deep Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Response Overlay Phase and Tool-Ghost Runtime Reference](../frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Frontend Overlay + Wakeword Control Channel Reference](../frontend/contracts/overlay_and_wakeword_control_channel_reference.md)
- [Frontend Runtime Invariants and PR Checklist](../frontend/runtime/frontend_runtime_invariants_checklist.md)
