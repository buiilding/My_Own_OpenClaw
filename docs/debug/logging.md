---
summary: "WindieOS logging guide covering backend LOG_LEVEL profiles, Electron stdout/stderr, sidecar stderr, renderer console traces, and packaged app log controls."
read_when:
  - When a runtime exits silently or logs are too noisy to isolate a bug.
  - When changing logging setup, launch scripts, sidecar stderr handling, or debug trace output.
title: "Logging"
---

# Logging

WindieOS has four practical log streams: backend Python logs, Electron main stdout/stderr, renderer DevTools console output, and sidecar Python stderr. Keep protocol stdout clean for sidecar JSON-RPC.

## Backend Logs

Backend logging is configured in `backend/src/core/logging_setup.py`.

Use [Observability Change Workflow](observability_change_workflow.md) before adding new log streams, trace flags, metrics, or evidence collection paths.

| Control | Behavior |
| --- | --- |
| `WINDIEOS_LOG_PROFILE=important` | Default profile. Keeps high-signal INFO while suppressing noisy internals and third-party libraries. |
| `WINDIEOS_LOG_PROFILE=verbose` | Enables DEBUG-level backend logs unless `LOG_LEVEL` overrides the root level. |
| `LOG_LEVEL=DEBUG` | Overrides the root Python logging level. |
| `WINDIEOS_LITELLM_SUPPRESS_DEBUG_INFO=0` | Allows LiteLLM debug/help output that is normally suppressed. |

Backend logger names matter because the important profile demotes several noisy modules. If a debug path appears quiet, check whether `logging_setup.py` explicitly sets that logger to WARNING.

Useful backend commands:

```bash
LOG_LEVEL=DEBUG WINDIEOS_LOG_PROFILE=verbose ./scripts/run-backend
LOG_LEVEL=DEBUG ./scripts/test-backend tests/backend/test_websocket_route.py -q
```

## Electron Main Logs

Electron main uses `console.log`, `console.warn`, and `console.error`. The launcher in `frontend/scripts/electron-launcher.cjs` forwards Electron stdout and filters a small set of known Chromium stderr warnings.

Useful commands:

```bash
cd frontend
npm run electron:dev
WINDIE_DEBUG_STREAM_EVENTS=1 npm run electron:dev
WINDIE_DEBUG_CHAT_PILL=1 npm run electron:dev
WINDIE_DEBUG_TOOL_SCREENSHOT=1 npm run electron:dev
npm run test:ghost-cursor
```

Important main-process flags:

| Flag | Effect |
| --- | --- |
| `WINDIE_DEV_UI=1` | Set by `npm run electron:dev`; enables developer UI/transparency paths. |
| `WINDIE_DEBUG_STREAM_EVENTS=1` | Enables stream trace propagation into renderer URLs and main IPC trace logs. |
| `WINDIE_DEBUG_CHAT_PILL=1` | Enables main chat pill trace logs in `frontend/src/main/chat_pill_trace_runtime.cjs`. |
| `WINDIE_DEBUG_TOOL_SCREENSHOT=1` | Adds renderer screenshot debug query params for tool screenshot traces. |
| `WINDIE_DEBUG_GHOST_OVERLAY=1` | Enabled by `npm run test:ghost-cursor` for OS tool ghost overlay debugging. |

Chat pill visibility decisions are always logged from Electron main with:

- `[ChatPillVisibility][main]`

The payload includes `action`, `reason`, `user_hidden`, `focus`,
`restore_response_overlay`, `result_reason`, `chat_window_visible`, and
`response_window_visible`. Use it to tell why the pill appeared or why a
generic restore was suppressed. Handoff hides include the main-window cause in
the reason, for example `surface-handoff:chat-pill-settings` or
`surface-handoff:renderer:settings`.

## Renderer Logs

Renderer logs are visible in Electron DevTools and are usually gated by query params that Electron main injects into window URLs.

| Trace | Code root | Enablement |
| --- | --- | --- |
| Stream trace | `frontend/src/renderer/features/chat/utils/chatStream/chatStreamDebugTrace.ts` | URL has `debug_stream=1` or `debug_chat_pill=1` |
| Chat pill trace | Same renderer trace module | URL has `debug_stream=1` or `debug_chat_pill=1` |
| Tool screenshot trace | `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs` | `WINDIE_DEBUG_TOOL_SCREENSHOT=1` |

Main injects these params through `frontend/src/main/main_window_overlay_runtime.cjs` when the matching environment flags are set.

## Sidecar Logs

The Python sidecar logs to stderr in `frontend/src/main/python/local_backend.py`; stdout is reserved for JSON-RPC messages. Do not move sidecar logs to stdout.

| Control | Behavior |
| --- | --- |
| `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` | Raises sidecar Python logs to DEBUG. |
| `WINDIE_VERBOSE_SIDECAR_STDERR=0` | Used by packaged reinstall flows to reduce sidecar stderr noise. |
| `WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0` | Disables the local semantic summarizer for focused local-backend debugging. |
| `WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL=0` | Prevents sidecar browser feature-pack auto-install while debugging runtime availability. |

Useful command:

```bash
cd frontend
WINDIE_SIDECAR_LOG_LEVEL=DEBUG npm run electron:dev
```

## Packaged App Logs

Packaged reinstall scripts expose log controls:

- macOS: `scripts/reinstall-windieos-macos.sh`
- Windows: `scripts/reinstall-windieos-windows.ps1`
- Linux: `scripts/reinstall-windieos-linux.sh`

On macOS, `WINDIE_LOG_FILE` defaults to `~/windieos-packaged-run.log` in the reinstall helper. Keep packaged debugging separate from source-run debugging because app paths, Python paths, and permission state differ.
