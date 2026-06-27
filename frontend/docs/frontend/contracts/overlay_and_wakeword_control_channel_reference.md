---
summary: "Overlay and wakeword control IPC reference: visibility/phase/toggle channels, main-process emit points, and renderer consumers for minimal pill + config state."
read_when:
  - When changing chat overlay visibility behavior, wakeword suppression rules, or overlay phase broadcasting.
  - When debugging `wakeword-toggle` or `response-overlay-*` channel drift between main and renderer.
title: "Overlay and Wakeword Control Channel Reference"
---

# Overlay and Wakeword Control Channel Reference

## Canonical Modules

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js`

## Channel Set

Primary main->renderer control channels:

- `wakeword-toggle`
- `response-overlay-phase`
- `response-overlay-visibility`
- `chatbox-focus`

All are allowlisted in preload. `response-overlay-phase` is now a
main-process/native-window signal; renderer chat surfaces use SDK
`currentTurnProjection` for typing, response content, busy, and stop state.

## Wakeword Toggle Contract

Emitter:

- `index.cjs` `sendWakewordToggle(enabled)`

Emit points:

- `showChatWindow()` -> sends `{ enabled: false }` (suppress wakeword while chat overlay is shown)
- `hideChatWindow()` -> sends `{ enabled: true }` (re-enable wakeword when overlay hidden)
- renderer startup seeds suppression from the current surface before the first visibility event:
  - main dashboard starts unsuppressed
  - overlay views start suppressed

Primary renderer consumer:

- `DesktopVoiceRuntimeClient` listens on `ON_CHANNELS.WAKEWORD_TOGGLE` and
  emits value-level wakeword-toggle state to `AppConfigProvider`
- persisted preference comes from `config.wakeword_enabled`
- updates `wakewordSuppressed = !enabled`
- effective wakeword runtime state is `wakewordActive = wakewordEnabled && !wakewordSuppressed`

## Overlay Phase Contract

Emitter:

- `ipc.cjs` via `setResponseOverlayPhase(phase, source)`

Canonical phases:

- `idle`
- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`

Typical transitions:

- query send -> `awaiting-first-chunk`
- first text chunk -> `streaming`
- tool events -> `tool-call` / `awaiting-first-chunk`
- terminal -> `complete` or `error`
- disconnect/send failure -> `idle`

Consumers:

- `ChatBox` (input pill behavior + click-through policy)
- `ChatBoxResponse` (response overlay content mode + visibility intent)
- optional window-level callbacks in main for overlay window show/hide behavior

## Overlay Visibility Contract

Emitter:

- `index.cjs` `broadcastResponseOverlayVisibility(visible)`

Emit points:

- `showChatWindow()` broadcasts current response overlay visibility
- `hideChatWindow()` broadcasts `false`
- `applyResponseOverlayPhase()` broadcasts:
- `false` on `idle`
- `true` while streaming/tool-active phases

Purpose:

- provide explicit response-overlay visibility state independent of phase heuristics for chatbox UI decisions.

Primary renderer consumer:

- `ChatBox` listens on `ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY`
- tracks `isResponseOverlayVisible` state for input-shell behavior.

## Chatbox Focus Contract

Emitter:

- `index.cjs` in `showChatWindow({ focus: true })`

Payload:

- no custom payload; event-only trigger

Consumer:

- `ChatBox` listens on `ON_CHANNELS.CHATBOX_FOCUS`
- turns off click-through and focuses input field

## Main-Process Window Coupling

Channel emissions are tied to window orchestration:

- `showChatWindow` and `hideChatWindow` control both overlay windows and wakeword suppression
- overlay teardown hides any live overlay surface even if the chat pill window is absent
- response overlay phase callback (`applyResponseOverlayPhase`) coordinates window visibility plus visibility broadcasts

This means channel behavior depends on both backend stream state (`ipc.cjs`) and local overlay-window state (`index.cjs`).

## Drift Hotspots

1. preload allowlist includes channel but `channels.ts` constants missing (or vice versa)
2. main emits `response-overlay-visibility` but renderer never subscribes (silent UX drift)
3. wakeword toggle payload shape changed (`enabled` missing/non-boolean) -> `wakewordSuppressed` state desync
4. phase transitions updated in `ipc.cjs` without corresponding UI assumptions in chatbox/response components

## Debug Checklist

If wakeword does not re-enable after closing overlay:

1. verify `hide-chatbox` path executed in main
2. verify `wakeword-toggle {enabled:true}` delivered to renderer
3. verify `wakewordEnabled` setting still true in app config context

If response overlay UI and actual window visibility diverge:

1. inspect `response-overlay-phase` stream transitions
2. inspect explicit `response-overlay-visibility` events from main
3. verify `ChatBox` listener updates local visibility flag

If input does not focus when chat opens:

1. verify `chatbox-focus` event is emitted from `showChatWindow({focus:true})`
2. verify `ChatBox` listener is mounted
3. inspect shared response-overlay phase handling for stale loop interactivity state

## Cross-Doc References

- window lifecycle + overlay bounds behavior: `docs/frontend/main/window_and_overlay_lifecycle.md`
- renderer chatbox overlay behavior: `docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md`
- renderer response overlay behavior: `docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md`
- websocket phase emission source: `docs/frontend/main/websocket_handshake_and_settings_sync_reference.md`
- wakeword runtime bridge internals: `docs/frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md`
