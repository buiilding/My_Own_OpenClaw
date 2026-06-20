---
summary: "Deep reference for the current overlay query-capture blur/settle flow before query screenshot and system-state collection."
read_when:
  - When changing `showChatWindow` focus behavior or overlay query capture timing.
  - When debugging screenshots that capture desktop app windows instead of target external apps.
title: "Overlay Query-Capture Blur and Settle Reference"
---

# Overlay Query-Capture Blur and Settle Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`

## Platform Scope

Overlay query-capture prep is now platform-consistent:

- no native external-window snapshot/restore path
- no `node-window-manager` dependency
- send/capture prep is blur-only plus a short settle delay before capture continues

## Query-Capture Pre-Focus Hook

`prepareOverlayQueryCaptureFocus()` sequence:

1. blur `chatWindow` when available
2. blur `mainWindow` when available
3. blur `responseWindow` when available
4. wait settle duration (`120ms` default)

This hook is registered into IPC init as `onBeforeOverlayQueryCapture`.

Intent:

- reduce chance of capturing desktop overlay/main windows in screenshot query path
- give compositor/focus stack time to settle before system-state capture runs without trying to foreground another app

## Integration with Query Send Pipeline

Main process query relay flow calls the hook before capture-enriched query send path.

Coupled behavior:

- overlay chat UI can remain visible without any cross-app focus handoff
- query-time system state and screenshot capture are less likely to sample desktop app windows as active

## Drift Hotspots

1. removing settle delay and causing intermittent self-capture
2. reintroducing platform-specific focus-restore behavior into the shared send path
3. changing the blur target list without updating tests/docs for the capture hook

## Debug Checklist

If overlay captures itself in screenshot path:

1. verify `onBeforeOverlayQueryCapture` callback is wired in IPC init
2. verify the visible desktop app windows expose `blur()` and the hook is calling them
3. verify the settle delay is still present in the hook path before capture continues

If chatbox focus behavior regresses after toggle:

1. inspect `showChatWindow({focus:true})` ordering
2. verify `showChatWindow({focus:false})` still uses non-activating show when available
3. verify no new external-app focus restore path was introduced into normal show/send flow
