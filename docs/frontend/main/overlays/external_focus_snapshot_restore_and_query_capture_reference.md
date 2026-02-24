---
summary: "Deep reference for Windows-only external focus snapshot/restore in Electron main and pre-capture overlay blur/settle flow before query screenshot collection."
read_when:
  - When changing `showChatWindow` focus behavior or overlay query capture timing.
  - When debugging screenshots that capture WindieOS windows instead of target external apps.
title: "External Focus Snapshot, Restore, and Query-Capture Reference"
---

# External Focus Snapshot, Restore, and Query-Capture Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/query_payload.cjs`

## Platform Scope

External focus snapshot/restore logic is active only on Windows (`process.platform === "win32"`).

Non-Windows behavior:

- snapshot and restore helpers return early
- overlay capture prep still blurs WindieOS windows and waits settle delay

## Snapshot Contract

`capturePreviousExternalFocusedWindow()`:

1. reads active native window via `node-window-manager`
2. ignores empty titles
3. ignores titles matching WindieOS app markers:
   - `"desktop assistant"`
   - `"windieos"`
4. stores:
   - external window id
   - exact title fallback

Called from:

- `showChatWindow({ focus: true })` before chat window gets focus

## Restore Contract

`restorePreviousExternalFocusedWindow()`:

1. enumerates windows from `windowManager.getWindows()`
2. tries id match first
3. falls back to exact title match
4. if match has `bringToTop()`, calls it and returns true
5. on failure, logs warning and returns false

Restoration is best effort and non-fatal.

## Query-Capture Pre-Focus Hook

`prepareOverlayQueryCaptureFocus()` sequence:

1. blur `chatWindow` when available
2. blur `mainWindow` when available
3. attempt external focus restore
4. wait `120ms`

This hook is registered into IPC init as `onBeforeOverlayQueryCapture`.

Intent:

- reduce chance of capturing WindieOS overlay/main windows in screenshot query path
- give compositor/focus stack time to settle before system-state capture runs

## Integration with Query Send Pipeline

Main process query relay flow calls the hook before capture-enriched query send path.

Coupled behavior:

- overlay chat UI can remain visible while focus temporarily hops to external app
- screenshot capture tool then samples external app state instead of overlay

## Drift Hotspots

1. changing app title markers without keeping `isAppWindowTitle` up to date
2. removing settle delay and causing intermittent self-capture
3. snapshotting only id without title fallback (window id can be stale)
4. calling restore before windows are blurred

## Debug Checklist

If overlay captures itself in screenshot path on Windows:

1. verify `onBeforeOverlayQueryCapture` callback is wired in IPC init
2. verify snapshot fields (`lastExternalFocusedWindowId/title`) were populated before focus shift
3. inspect warnings from restore helper for `node-window-manager` failures

If chatbox focus behavior regresses after toggle:

1. inspect `showChatWindow({focus:true})` ordering (snapshot then focus)
2. verify restore only runs in pre-capture hook, not in normal show flow
3. verify app-window title marker list still matches active app window titles
