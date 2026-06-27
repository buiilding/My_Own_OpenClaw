---
summary: "WindieOS desktop logs and logging guide covering backend LOG_LEVEL profiles, Electron stdout/stderr, layer log sink helpers such as ensureLogFile and resolveRendererVerboseLogFile, renderer interaction logger diagnostics and renderer interaction redaction, local-runtime stderr, renderer console traces, and packaged app log controls."
read_when:
  - When desktop logs, layer logs, or runtime logs are missing, too noisy, or needed to isolate a bug.
  - When changing logging setup, launch scripts, renderer interaction logger behavior, renderer interaction diagnostics redaction, local-runtime Python stderr handling, or debug trace output.
  - When resolving layer log sink helper references such as `ensureLogFile`, `resolveRendererVerboseLogFile`, renderer verbose logs, or `<windie> logs renderer --verbose`.
title: "Logging"
---

# Logging

WindieOS has four practical log streams: backend Python logs, Electron main stdout/stderr, renderer DevTools console output, and local-runtime Python stderr. Keep protocol stdout clean for the local-runtime JSON-RPC path.

## Backend Logs

Backend logging is configured in private backend implementation.

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
LOG_LEVEL=DEBUG WINDIEOS_LOG_PROFILE=verbose private backend start command
LOG_LEVEL=DEBUG private backend tests private backend tests -q
```

## Electron Main Logs

Electron main uses `console.log`, `console.warn`, and `console.error`. The launcher in `frontend/scripts/electron-launcher.cjs` forwards Electron stdout, filters a small set of known Chromium stderr warnings, and appends the forwarded stream to `.windie/logs/frontend.log`.
Main-process console mirroring must not crash the app during shutdown: closed
stdout/stderr transport errors such as `EPIPE` are treated as terminal pipe
teardown both when console writes throw synchronously and when stdout/stderr
emit asynchronous stream errors. The layer-owned `.windie/logs/main.log` write
remains the durable record.

Treat `.windie/logs/frontend.log` as an aggregate launcher stream, not as the
owner for every frontend-layer event. Prefer the layer-owned files and app
diagnostic paths when proving what a runtime emitted; the aggregate stream is
useful for quick startup context, but it should not be parsed to reassign events
to renderer, main, local-runtime, or SDK owners.

`frontend/src/main/logging/layer_log_sink.cjs` owns generic layer log path
resolution, file initialization, append APIs, renderer verbose log writes, and
console mirroring. The default generic scratch path is configurable by the host;
the WindieOS host skin sets source runs to `.windie/logs`, and the Electron
entrypoint, launcher, and `<windie> logs ...` configure the sink from that
skin before resolving defaults. CLI log inspection uses
`resolveLayerLogFile(...)`, `resolveRendererVerboseLogFile(...)`, and
`ensureLogFile(...)` so it can create or tail the correct file. Runtime feature
code should use layer append/banner APIs or the owning diagnostic path instead
of resolving log files directly.

Useful commands:

```bash
<windie> start desktop
<windie> start dev
<windie> logs frontend
<windie> logs frontend --tail 500 --no-follow
WINDIE_DEBUG_STREAM_EVENTS=1 <windie> start desktop
WINDIE_DEBUG_CHAT_PILL=1 <windie> start desktop
WINDIE_DEBUG_TOOL_SCREENSHOT=1 <windie> start desktop
WINDIE_FRONTEND_LOG_FILE=/tmp/agent-frontend.log <windie> start desktop
npm --prefix frontend run test:ghost-cursor
```

The default `.windie/logs/*` directory and WindieOS log override env names are
provided by the host skin. Set the `WINDIE_<LAYER>_LOG_FILE` or
`WINDIE_RENDERER_VERBOSE_LOG_FILE` overrides when a WindieOS run must keep
writing to a legacy or externally managed path. The reusable sink's generic
fallback env prefix is `AGENT_`. Generic hosts use the `local-runtime` layer
and `AGENT_LOCAL_RUNTIME_LOG_FILE`; the WindieOS skin maps that layer to
`.windie/logs/sidecar.log` and also honors `WINDIE_SIDECAR_LOG_FILE` for
compatibility.

Important main-process flags:

WindieOS maps these public flags through `main_host_skin.debug.env`; the
generic Electron host helper defaults to matching `AGENT_*` names when no skin
override is provided.

| Flag | Effect |
| --- | --- |
| `WINDIE_DEV_UI=1` | Set by `<windie> start desktop`; enables developer UI/transparency paths. |
| `WINDIE_DEBUG_STREAM_EVENTS=1` | Enables stream trace propagation into renderer URLs and main IPC trace logs. |
| `WINDIE_DEBUG_CHAT_PILL=1` | Enables main chat pill trace logs in `frontend/src/main/debug/chat_pill_trace_runtime.cjs`. |
| `WINDIE_DEBUG_LIVE_SURFACE=1` | Enables verbose ephemeral `[LiveSurfaceTrace]` surface state logs. |
| `WINDIE_DEBUG_IPC_STDOUT=1` | Mirrors compact IPC bridge diagnostics and generic bridge status to stdout as `[IPC Bridge]` / `[ElectronTrace]` lines. |
| `WINDIE_DEBUG_STARTUP_STDOUT=1` | Mirrors desktop startup diagnostics to stdout as `[Main][StartupMetrics]` lines. |
| `WINDIE_DEBUG_WAKEWORD_STDOUT=1` | Mirrors wakeword lifecycle diagnostics to stdout as `[Wakeword]` lines. |
| `WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT=1` | Mirrors local-runtime lifecycle diagnostics on the `local_runtime.lifecycle` path to stdout. |
| `WINDIE_DEBUG_SURFACE_STDOUT=1` | Mirrors surface visibility and renderer interaction diagnostics to stdout as compact lines. |
| `AGENT_DEBUG_COMPACTION_STDOUT=1` | Mirrors SDK compaction normalization/storage/rejection debug details to stdout. Prefer durable `backend.compaction` trace rows for turn-scoped evidence. |
| `WINDIE_DEBUG_TOOL_SCREENSHOT=1` | Adds renderer screenshot debug query params for tool screenshot traces. |
| `WINDIE_DEBUG_GHOST_OVERLAY=1` | Enabled by `npm --prefix frontend run test:ghost-cursor` for OS tool ghost overlay debugging. |

Default Electron main CLI output keeps structured lifecycle traces out of
stdout. Use app diagnostics to inspect the persistent path registry and latest
rows:

```bash
<windie> diagnostics paths
<windie> diagnostics list --path desktop.startup --limit 50
<windie> diagnostics list --path ipc.bridge --limit 50
<windie> diagnostics list --path local_runtime.lifecycle --limit 50
<windie> diagnostics list --path wakeword.lifecycle --limit 50
```

`ipc.bridge` is the persistent mirror for compact `[ElectronTrace]` milestones:
renderer query send, backend connection state, first backend event per turn,
tool call/output, backend completion, and settings updates. Rows summarize ids,
counts, lengths, selected settings names, provider ids, and model ids without
raw user text, assistant text, provider payloads, or secrets.

Chat pill visibility and response-overlay window decisions are stored as app
diagnostics instead of being printed to stdout by default. Inspect them with:

```bash
<windie> diagnostics list --path surface.visibility --limit 50
```

Rows include action, reason, mode, phase, user-hidden state, focus, result
reason, guard refs, requested visibility, and final chat/response visibility.
Use it to tell why the pill appeared, why a generic restore was suppressed, or
why the response overlay hid/showed. Handoff hides include the main-window cause
in the reason, for example `surface-handoff:chat-pill-settings` or
`surface-handoff:renderer:settings`. Use `[LiveSurfaceTrace]` or
`[ChatPillTrace]` for deeper opt-in surface diagnostics.

## Renderer Logs

Renderer logs are visible in Electron DevTools and are usually gated by query params that Electron main injects into window URLs.
Frontend interaction logs are normalized through `renderer-log` IPC and stored
as app diagnostics instead of being printed to stdout by default. Inspect them
with:

```bash
<windie> diagnostics list --path renderer.interaction --limit 50
```

Rows include action, event, view, target tag/type/role, and safe counts. They do
not store raw labels or message text because those can contain chat titles or
user content.

Renderer display-row projection image-count summaries are persisted under:

```bash
<windie> diagnostics list --path renderer.display_projection --limit 50
```

Use this path when a screenshot-bearing user message reaches the SDK but does
not appear in dashboard. The diagnostic stores projection counts only, including
SDK user-image rows, SDK-projected image rows, optimistic user rows, and merged
visible user-image rows. It does not store chat text, screenshot URLs, screenshot
refs, or image bytes.

Renderer interaction logging is intentionally narrow. Feature code should use
the renderer app runtime client instead of importing the infrastructure logger
directly:

- `DesktopInteractionRuntimeClient.installInteractionLogger()` installs the
  document-level click/change listener from the renderer app entrypoint.
- `DesktopInteractionRuntimeClient.logUserSentMessage(...)` records the explicit
  send-message breadcrumb used by the chat send path, while
  `rendererInteractionLogger.js` keeps target description, redaction, dispatch,
  and the lower-level install/send-message implementations private to the
  diagnostics infrastructure.

For browser-only renderer debugging, the logger accepts private
`window.__DESKTOP_RUNTIME_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__` and
`window.__DESKTOP_RUNTIME_DEBUG_SURFACE_STDOUT__` toggles. Previous product-
or agent-branded window toggle prefixes are no longer read by the renderer
logger.

Target description, entry construction, summary formatting, and generic
interaction dispatch stay private to `rendererInteractionLogger.js`. Electron
main owns the final diagnostic normalization and stdout summary formatting after
the renderer sends the `renderer-interaction` payload through `renderer-log`.

| Trace | Code root | Enablement |
| --- | --- | --- |
| Stream trace | `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts` | URL has `debug_stream=1` or `debug_chat_pill=1` |
| Chat pill trace | Same renderer trace module | URL has `debug_stream=1` or `debug_chat_pill=1` |
| Tool screenshot trace | `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs` | `WINDIE_DEBUG_TOOL_SCREENSHOT=1` |

Main injects these params through `frontend/src/main/surfaces/main_window_overlay_runtime.cjs` when the matching environment flags are set.

## Local Runtime Logs

The Python local runtime logs to stderr in `frontend/src/main/python/local_backend.py`; stdout is reserved for JSON-RPC messages. Do not move local-runtime logs to stdout.

| Control | Behavior |
| --- | --- |
| `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` | Raises local-runtime Python logs to DEBUG. Generic hosts should use `AGENT_LOCAL_RUNTIME_LOG_LEVEL`; `AGENT_SIDECAR_LOG_LEVEL` remains a compatibility alias. |
| `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR=0` | Used by packaged reinstall flows to reduce local-runtime stderr noise. The generic Electron host helper defaults to `AGENT_VERBOSE_LOCAL_RUNTIME_STDERR`; the WindieOS host skin maps the public Windie flag into that helper. |
| `AGENT_ENABLE_SEMANTIC_SUMMARIZER=0` (`WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0` in WindieOS launches) | Disables the local semantic summarizer for focused local-runtime debugging; Electron main mirrors the WindieOS skin key into the generic Agent SDK key. |
| `AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL=0` (`WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL=0` in WindieOS launches) | Prevents local-runtime browser feature-pack auto-install while debugging runtime availability; Electron main mirrors the WindieOS skin key into the generic Agent SDK key. |

Useful command:

```bash
cd frontend
<windie> logs local-runtime
WINDIE_SIDECAR_LOG_LEVEL=DEBUG <windie> start desktop
```

`<windie> logs sidecar` remains a compatibility alias for the same WindieOS log
file.

## Packaged App Logs

Packaged reinstall scripts expose log controls:

- macOS: `<windie> reinstall mac`
- Windows: `<windie> reinstall win`
- Linux: `<windie> reinstall linux`

On macOS, `WINDIE_LOG_FILE` defaults to `~/windieos-packaged-run.log` in the reinstall helper. Keep packaged debugging separate from source-run debugging because app paths, Python paths, and permission state differ.
