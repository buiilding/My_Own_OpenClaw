---
summary: "Pre-flight plan for making minimal chat pill textarea focus reflect a real native keyboard-focus handoff."
read_when:
  - When changing minimal chat pill textarea focus, BrowserWindow focus policy, overlay hit testing, click-through behavior, or keyboard ownership indicators.
  - When debugging two visible text carets between WindieOS and another app after clicking the minimal chat pill.
title: "Minimal Chat Pill Focus Handoff Plan"
---

# Minimal Chat Pill Focus Handoff Plan

Status: approved and implemented on 2026-06-11.

## User Intent

When the user clicks inside the dark minimal chat pill textarea, WindieOS should
make a clear native focus handoff and then focus the pill textarea. The visible
blinking caret in the minimal pill must mean keyboard input will land in
WindieOS.

The current confusing behavior is that another app, such as Codex, can still
show its own text caret while the minimal chat pill also shows a caret. The user
cannot reliably tell which surface owns typing.

## Problem Statement

The minimal chat pill currently mixes two focus models:

- Electron main owns native BrowserWindow visibility, focusability, hit testing,
  and click-through policy.
- The minimal pill renderer owns textarea DOM focus and auto-focuses the input
  on mount or after a `chatbox-focus` event.

Those paths are not strict enough. A renderer-level textarea focus can show a
caret even when the native focus handoff to the WindieOS overlay has not been
made obvious to the OS/user. Conversely, the overlay intentionally uses
pass-through and non-focusing behavior for some workflows, where showing an
active caret is misleading.

## Target Contract

Define one focus contract for text entry:

1. Pointer enters the minimal pill:
   - Electron main may make the overlay hit-test active.
   - This alone must not imply text-entry ownership.
2. User clicks inside the minimal pill textarea:
   - Renderer reports an explicit text-entry activation request to Electron
     main.
   - Electron main makes the chat pill natively focusable and active unless a
     pointer-control lease forbids interaction.
   - Electron main emits `chatbox-focus` only after the native activation path
     has been attempted.
   - Renderer focuses the textarea only from that explicit text-entry path.
3. User clicks outside, the overlay blurs, or the pill becomes pass-through:
   - Renderer must clear the active text-entry visual state.
   - The pill may remain visible and hover-interactive, but it must not show a
     misleading active text caret.
4. Non-focusing surface restores, screenshots, pointer-control leases, and
   tool-surface handoffs:
   - Must not trigger textarea focus.
   - Must preserve the existing no-focus-steal policy.

## Source Of Truth Changes

- Electron main remains the owner of native BrowserWindow focusability,
  activation, hit testing, and lease-scoped non-focusable policy.
- Renderer remains the owner of DOM textarea focus and visual text-entry state,
  but it must only present active text entry after Electron main accepts the
  activation path.
- The existing `chatbox-focus` event should become a more meaningful signal:
  not "renderer may focus whenever it mounted," but "main accepted a focusing
  chat-pill action."
- The SDK and backend are out of this ownership path. No agent runtime, query
  transport, sidecar, or provider behavior should change.

## Current Code Anchors

Reread these before implementation:

- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/desktop/minimal_chat_pill.md`
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/surfaces/surface_runtime.cjs`
- `frontend/src/main/surfaces/overlay_visibility_handler.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js`
- `frontend/src/renderer/infrastructure/ipc/bridge`
- `frontend/src/shared/ipcChannels.json`
- `tests/frontend/WindowVisibilityRuntime.test.cjs`
- `tests/frontend/SurfaceRuntime.test.cjs`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/OverlayVisibilityHandler.test.cjs`

## Implementation Workflow

1. Reconstruct the current event timeline:
   - pill creation and default `setIgnoreMouseEvents(true, { forward: true })`
   - renderer pointer-in-pill hit-test activation
   - native `showChatWindow({ focus: true })`
   - `chatbox-focus` emission
   - renderer textarea focus on mount and event
   - blur and pass-through cleanup
2. Remove or narrow renderer auto-focus on mount:
   - keep initial focus only if Electron main explicitly requested a focusing
     show for text entry
   - avoid DOM focus on passive render/load
3. Add or reuse an IPC path for text-entry activation:
   - renderer calls it from textarea pointer/click/focus intent
   - main activates the chat window through the same native owner that already
     manages BrowserWindow policy
   - main refuses or no-ops during pointer-control leases or non-interactive
     states
4. Gate the renderer caret state:
   - focus the textarea after `chatbox-focus`
   - clear active text-entry state on window blur, textarea blur, pass-through
     restore, or rejected activation
   - ensure click/keyboard flows still put the caret at the end of existing text
5. Preserve overlay hit testing:
   - pointer hover should still control click-through shape
   - clicking outside the rounded pill should still pass through to underlying
     apps
   - pointer-control and screenshot leases must not start stealing focus
6. Add focused tests before broad manual validation:
   - renderer does not auto-focus on passive mount
   - renderer focuses only after explicit `chatbox-focus`
   - clicking the textarea invokes the text-entry activation IPC
   - non-focusing show/restore does not emit `chatbox-focus`
   - focusing show still emits `chatbox-focus`
   - pointer-control lease keeps the pill non-focusable and does not focus the
     textarea
7. Reread the affected paths after implementation and classify any remaining
   focus/hit-test paths as fixed, intentionally preserved, or out of scope.

## Out Of Scope

- Changing SDK conversation runtime, backend query execution, or sidecar tool
  execution.
- Reworking response overlay visibility or live-turn presentation.
- Changing dashboard composer focus behavior except where tests need to prove
  the minimal pill no longer conflicts with external app focus.
- Solving every possible macOS cross-app caret rendering quirk. The required
  product behavior is that WindieOS does not show an active minimal-pill caret
  unless it has performed the native focus handoff for text entry.

## Success Criteria

- Clicking inside the minimal pill textarea performs a native WindieOS focus
  handoff before the renderer shows an active text caret.
- Passive pill visibility, startup rendering, tool restores, screenshot
  restores, and pointer-control leases do not focus the textarea.
- The user can distinguish "hover/clickable pill" from "Windie owns typing."
- Existing click-through behavior outside the rounded pill remains intact.
- Existing show/hide behavior, wakeword/hotkey summons, and dashboard-close
  handoff do not regress.
- Focus and hit-test traces remain useful enough to diagnose why the pill did
  or did not accept text-entry ownership.

## Validation Commands

Run focused validation first:

```bash
bin/windie docs list
cd frontend && npm test -- --runTestsByPath \
  ../tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx \
  ../tests/frontend/WindowVisibilityRuntime.test.cjs \
  ../tests/frontend/SurfaceRuntime.test.cjs \
  ../tests/frontend/OverlayVisibilityHandler.test.cjs
```

If implementation changes shared IPC contracts, also run:

```bash
cd frontend && npm test -- --runTestsByPath \
  ../tests/frontend/PreloadIpcChannels.test.cjs \
  ../tests/frontend/OverlayPhaseIpcRuntime.test.cjs
```

Manual validation:

- Open an external text editor or Codex input with a visible caret.
- Click inside the minimal chat pill textarea.
- Confirm typing lands in WindieOS and the external app no longer appears to be
  the active text-entry target.
- Click outside the pill into the external app.
- Confirm WindieOS clears active text-entry presentation and typing lands in
  the external app.
- Trigger a non-focusing surface restore or screenshot/tool lease.
- Confirm the pill stays visible when expected but does not show an active
  text-entry caret.

## Compaction Reread Anchors

If context is compacted before implementation finishes, reread:

1. This plan.
2. The matching report, once created.
3. `docs/desktop/minimal_chat_pill.md`.
4. `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`.
5. The focused tests listed above.
6. `git status --short` and `git diff -- docs/plans frontend/src/main/surfaces frontend/src/renderer/features/minimalChatPill tests/frontend`.
