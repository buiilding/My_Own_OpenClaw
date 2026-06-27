---
summary: "Diagnostic flag reference for WindieOS backend logs, Electron main traces, renderer URL traces, local-runtime Python stderr, VM worker mode, and packaged reinstall logging."
read_when:
  - When enabling the smallest useful debug signal for a backend, Electron, renderer, local-runtime Python process, overlay, stream, screenshot, or packaged-app failure.
  - When adding, removing, or renaming diagnostic environment flags.
title: "Diagnostic Flags"
---

# Diagnostic Flags

Enable the narrowest flag that proves which boundary broke. Do not leave verbose flags on in normal packaged flows.

## Backend

| Flag | Effect |
| --- | --- |
| `WINDIEOS_LOG_PROFILE=important` | Default high-signal backend log profile. |
| `WINDIEOS_LOG_PROFILE=verbose` | Enables broader DEBUG-level backend logs unless `LOG_LEVEL` overrides. |
| `LOG_LEVEL=DEBUG` | Sets root Python logging level. |
| `WINDIEOS_LITELLM_SUPPRESS_DEBUG_INFO=0` | Allows LiteLLM debug/help output that is normally suppressed. |

Example:

```sh
LOG_LEVEL=DEBUG WINDIEOS_LOG_PROFILE=verbose <windie> start backend
```

## Electron Main and Renderer

WindieOS maps these public flags through `main_host_skin.debug.env`. The
generic Electron host debug helper defaults to matching `AGENT_*` flag names for
non-Windie skins.

| Flag | Effect |
| --- | --- |
| `WINDIE_DEV_UI=1` | Enables developer UI/transparency paths; set by `<windie> start desktop`. |
| `WINDIE_DEBUG_STREAM_EVENTS=1` | Enables stream trace propagation and main IPC stream logs. |
| `WINDIE_DEBUG_CHAT_PILL=1` | Enables chat pill and response overlay trace logs. |
| `WINDIE_DEBUG_LIVE_SURFACE=1` | Enables verbose ephemeral `[LiveSurfaceTrace]` surface timeline logs. |
| `WINDIE_DEBUG_IPC_STDOUT=1` | Mirrors `ipc.bridge` diagnostics and generic bridge status to stdout as `[IPC Bridge]` / `[ElectronTrace]` lines. |
| `WINDIE_DEBUG_STARTUP_STDOUT=1` | Mirrors `desktop.startup` diagnostics to stdout as `[Main][StartupMetrics]` lines. |
| `WINDIE_DEBUG_WAKEWORD_STDOUT=1` | Mirrors `wakeword.lifecycle` diagnostics to stdout as `[Wakeword]` lines. |
| `WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT=1` | Mirrors local-runtime lifecycle diagnostics on the `local_runtime.lifecycle` path to stdout. |
| `WINDIE_DEBUG_SURFACE_STDOUT=1` | Mirrors `surface.visibility` and `renderer.interaction` diagnostics to stdout as compact surface/interaction lines. |
| `AGENT_DEBUG_COMPACTION_STDOUT=1` | Mirrors SDK compaction normalization/storage/rejection debug details to stdout. Prefer `<windie> trace ... --path backend.compaction` for durable turn-scoped evidence. |
| `WINDIE_DEBUG_TOOL_SCREENSHOT=1` | Adds renderer screenshot debug query params for tool screenshot traces. |
| `WINDIE_DEBUG_GHOST_OVERLAY=1` | Enables OS tool ghost overlay debugging; used by `npm --prefix frontend run test:ghost-cursor`. |

Examples:

```sh
cd frontend
WINDIE_DEBUG_STREAM_EVENTS=1 <windie> start desktop
WINDIE_DEBUG_CHAT_PILL=1 <windie> start desktop
WINDIE_DEBUG_LIVE_SURFACE=1 <windie> start desktop
WINDIE_DEBUG_IPC_STDOUT=1 <windie> start desktop
WINDIE_DEBUG_TOOL_SCREENSHOT=1 <windie> start desktop
```

## Local-Runtime Python

| Flag | Effect |
| --- | --- |
| `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` | Raises Python local-runtime logs. Generic hosts should use `AGENT_LOCAL_RUNTIME_LOG_LEVEL`; `AGENT_SIDECAR_LOG_LEVEL` remains a compatibility alias. |
| `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR=1` | Forwards verbose local-runtime stderr through Electron main via the WindieOS host-skin env mapping. |
| `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR=0` | Reduces local-runtime stderr noise; used by packaged reinstall helpers. Generic Electron hosts can use `AGENT_VERBOSE_LOCAL_RUNTIME_STDERR` unless they provide their own skin env key. |
| `AGENT_ENABLE_SEMANTIC_SUMMARIZER=0` (`WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0` in WindieOS launches) | Disables semantic summarizer for focused local-runtime debugging; Electron main mirrors the WindieOS skin key into the generic Agent SDK key. |
| `AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL=0` (`WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL=0` in WindieOS launches) | Prevents browser feature-pack auto-install while debugging availability; Electron main mirrors the WindieOS skin key into the generic Agent SDK key. |

Local-runtime Python stdout is protocol traffic. Never log debug text to stdout.

## VM Worker and Runs

| Flag | Effect |
| --- | --- |
| `WINDIE_VM_MODE=1` | Enables hosted VM/dashboard-oriented app mode. |
| `WINDIE_VM_WORKER_MODE=1` | Explicitly enables worker heartbeat/polling mode. |
| `WINDIE_VM_WORKER_HEARTBEAT_MS=<ms>` | Worker heartbeat interval as a strict integer; minimum is 1000ms. |
| `WINDIE_VM_RUNS_API_KEY=<key>` | Worker-specific runs API key override. |

Use VM Worker Node (private backend docs) and Runs API Runbook (private backend docs) for the full control-plane flow.

## Packaged Reinstall

| Flag | Effect |
| --- | --- |
| `WINDIE_LOG_FILE=<path>` | Packaged run log path for local reinstall helpers. |
| `WINDIE_SIDECAR_LOG_LEVEL=<level>` | Local-runtime log level used by reinstall helpers; generic hosts should use `AGENT_LOCAL_RUNTIME_LOG_LEVEL`; `AGENT_SIDECAR_LOG_LEVEL` remains a compatibility alias. |
| `WINDIE_BUNDLE_ID=<id>` | Override bundle id in local reinstall flows. |
| `WINDIE_APP_NAME=<name>` | Override app name in local reinstall flows. |

Local reinstall logs are not release-signing validation.

## Related Docs

- [Logging](logging.md)
- [Observability Change Workflow](observability_change_workflow.md)
- [Runtime Traces](runtime_traces.md)
- Runtime Configuration Matrix (private backend docs)
- [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md)
