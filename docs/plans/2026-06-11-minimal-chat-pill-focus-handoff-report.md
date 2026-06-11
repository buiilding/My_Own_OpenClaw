---
summary: "Realtime report for implementing native focus handoff before minimal chat pill textarea focus."
read_when:
  - When continuing or auditing the minimal chat pill focus handoff implementation.
  - When debugging whether minimal pill textarea caret visibility is gated by Electron main focus ownership.
title: "Minimal Chat Pill Focus Handoff Report"
---

# Minimal Chat Pill Focus Handoff Report

Plan: [Minimal Chat Pill Focus Handoff Plan](./2026-06-11-minimal-chat-pill-focus-handoff-plan.md)

Status: implemented and validated on 2026-06-11.

## Checklist

- [x] Reread plan and owner docs/code anchors.
- [x] Remove passive renderer textarea auto-focus.
- [x] Add explicit text-entry activation IPC owned by Electron main.
- [x] Gate textarea focus on main-owned `chatbox-focus`.
- [x] Preserve hit-test, screenshot/tool restore, and non-focusing show behavior.
- [x] Add focused regression coverage.
- [x] Run focused validation.
- [x] Complete design-inspection pass.
- [x] Update changelog.
- [x] Commit scoped changes.

## Decisions

- Use a dedicated `activate-chatbox-text-entry` invoke instead of overloading
  passive `show-chatbox` calls. Visibility and text-entry ownership are
  different contracts.
- Keep Electron main as native BrowserWindow focus owner. Renderer may request
  text-entry activation and apply DOM focus only after main emits
  `chatbox-focus`.

## Validation Log

- Failed first attempt: `cd frontend && npm test -- --runTestsByPath
  ../tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx
  ../tests/frontend/WindowVisibilityRuntime.test.cjs
  ../tests/frontend/SurfaceRuntime.test.cjs
  ../tests/frontend/OverlayVisibilityHandler.test.cjs
  ../tests/frontend/OverlayPhaseIpcRuntime.test.cjs
  ../tests/frontend/IpcChannels.test.ts` because
  `useMinimalChatPillBindings.js` still referenced `INVOKE_CHANNELS` after an
  over-aggressive import cleanup.
- Passed after restoring the import: same focused frontend test command, 6 test
  suites, 106 tests.
- Passed: `cd frontend && npm test -- --runTestsByPath
  ../tests/frontend/PreloadIpcChannels.test.cjs`, 12 tests.
- Passed: `bin/windie docs list`.
- Passed: `node --check frontend/src/main/surfaces/surface_runtime.cjs &&
  node --check frontend/src/main/surfaces/overlay_visibility_handler.cjs &&
  node --check frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`.
- Passed: `git diff --check` for the scoped plan, runtime, renderer, IPC, and
  test files.
- Passed: `cd frontend && npm run lint`.
- Attempted broad gate: `bin/windie test frontend`. The suite reported 12
  failing test files unrelated to the focus-handoff change, including
  pre-existing SDK stream ordering expectations, config default drift,
  wakeword environment expectation drift, install-auth directory mode
  hardening, browser session readiness, IPC lifecycle, and persistence
  concurrency failures. After reporting results, Jest remained open because of
  lingering handles, so the completed test runner PIDs were terminated.

## Inspection Notes

- Current bad path confirmed: `useChatboxFocusBindings()` calls `focusInput()`
  on mount, independent of native focus ownership.
- Current good path to preserve: `showChatWindow({ focus: false })` uses
  `showInactive()` and does not emit `chatbox-focus`.
- Current good path to preserve: hit-test activation is shape-aware and separate
  from text-entry focus.
- Implementation removes passive mount focus. The only minimal-pill DOM focus
  path is now the `chatbox-focus` listener, while textarea pointer down and
  screenshot-toggle focus requests go through the Electron-main
  `activate-chatbox-text-entry` invoke.
- Pointer-control lease inspection is explicit in `surface_runtime`: text-entry
  activation returns `pointer-control-lease-active` and does not emit
  `chatbox-focus`.
- Remaining focused show paths such as wakeword and dashboard-close are
  intentional Electron-main summons that already call `showChatWindow({
  focus: true })` and emit `chatbox-focus`.

## Commits

- Implementation commit created from the scoped focus-handoff files in this
  turn.
