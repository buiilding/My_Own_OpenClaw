---
summary: "Runtime trace guide for stream events, chat pill phases, tool screenshots, overlay windows, sidecar JSON-RPC, and backend websocket events."
read_when:
  - When debugging event ordering across backend, Electron main, renderer, or sidecar.
  - When changing stream handling, overlay phases, screenshot capture, tool execution, or websocket routing.
title: "Runtime Traces"
---

# Runtime Traces

Runtime traces are useful when a bug depends on event order, process boundaries, or transient UI state. Enable the smallest trace that can prove which boundary broke.

Use [Observability Change Workflow](observability_change_workflow.md) before adding or renaming trace flags.

## Stream Event Trace

Use this when the backend sends events but the UI displays stale, missing, or duplicated content.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Backend formatter | `backend/src/api/formatters`, `backend/src/api/contracts` | Event type and payload shape. |
| Websocket route | `backend/src/api/routes/websocket` | Incoming query, task ownership, outgoing event stream. |
| Electron relay | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_runtime_helpers.cjs`, `frontend/src/main/ipc/ipc_renderer_windows.cjs` | Backend receive and renderer broadcast logs. |
| Renderer stream | `frontend/src/renderer/features/chat/hooks/useChatStream.ts` | Before/after event handling and workspace state. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_STREAM_EVENTS=1 npm run electron:dev
```

Expected markers:

- `[StreamTrace][main][recv]`
- `[StreamTrace][main][broadcast]`
- `[StreamTrace][renderer][before]`
- `[StreamTrace][renderer][after]`
- `[StreamTrace][renderer][response-surface]`

## Chat Pill And Response Overlay Trace

Use this when the minimal pill, awaiting indicator, or response overlay flickers, hides, opens at the wrong time, or ignores a terminal phase.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Phase contract | `frontend/src/shared/response_overlay_phase_contract.json` | Legal phase names and terminal states. |
| Main phase IPC | `frontend/src/main/response_overlay_phase_handler.cjs`, `frontend/src/main/overlay_phase_ipc_runtime.cjs` | Phase writes and renderer notification. |
| Main window policy | `frontend/src/main/surface_runtime.cjs`, `frontend/src/main/window_visibility_runtime.cjs`, `frontend/src/main/display_affinity_runtime.cjs` | Visibility, capture, content protection, and display affinity. |
| Renderer view model | `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`, `frontend/src/renderer/features/chat/hooks/useResponseOverlayViewModel.js` | Awaiting, streaming, complete, and error state transitions. |
| Chat pill trace | `frontend/src/main/chat_pill_trace_runtime.cjs`, `frontend/src/renderer/features/chat/utils/chatStream/chatStreamDebugTrace.ts` | Main and renderer state snapshots. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_CHAT_PILL=1 npm run electron:dev
```

Expected markers:

- `[ChatPillVisibility][main]`
- `[ChatPillTrace][main]`
- `[ChatPillTrace][renderer]`

`[ChatPillVisibility][main]` is always emitted for chat-pill show/hide
decisions and includes the show/hide `reason`, whether persisted
`user_hidden` intent was active, and whether a generic restore was suppressed.
`[ChatPillTrace][main]` and `[ChatPillTrace][renderer]` require the debug flag
above and include deeper phase/window snapshots.

Phase invariants to check:

- Awaiting indicator is latched from `tool-call`, `tool-output`, and `awaiting-first-chunk`.
- Transient `idle` must not clear the awaiting latch while the backend turn is still active.
- `streaming`, `complete`, `error`, or visible response content clears the awaiting shell.
- Linux can hide overlay surfaces during screenshot capture; Windows and macOS should not add capture-time hide/show for minimal chat pill or response overlay.

## Tool Screenshot Trace

Use this when screenshots are missing, stale, include overlays, or do not attach to the right turn.

| Layer | Code root | What to inspect |
| --- | --- | --- |
| Renderer query capture | `frontend/src/renderer/features/chat/utils/messageSender/queryScreenshotPipeline.ts` | Whether the outgoing query requested a screenshot and got an artifact ref. |
| SDK/main tool screenshot | `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs` | Tool screenshot stage and payload. |
| Main screenshot bridge | `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs` | Upload/fetch path for screenshot artifacts. |
| Sidecar screenshot tool | `frontend/src/main/python/tools/computer/screenshot_tool.py` | Platform capture path and cursor/overlay behavior. |
| Backend artifact load | `backend/src/services/artifacts/store.py`, `backend/src/api/routes/artifacts` | Artifact lookup and binary response. |

Enable:

```bash
cd frontend
WINDIE_DEBUG_TOOL_SCREENSHOT=1 npm run electron:dev
```

Expected marker:

- `[ToolShotDebug][renderer]`

## Sidecar JSON-RPC Trace

Sidecar stdout is JSON-RPC only. Debug by combining Electron bridge logs with sidecar stderr logs.

| Path | Code root |
| --- | --- |
| Main bridge process lifecycle | `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/local_backend_supervisor.cjs` |
| Main bridge request mapping | `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`, `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`, `frontend/src/main/local_backend_bridge_tool_args.cjs` |
| Sidecar protocol | `frontend/src/main/python/core/ipc_protocol.py`, `frontend/src/main/python/local_backend.py` |
| Tool registry | `frontend/src/main/python/tools/registry.py` |

Enable sidecar debug:

```bash
cd frontend
WINDIE_SIDECAR_LOG_LEVEL=DEBUG npm run electron:dev
```

If a sidecar result is missing, check for all of these before editing:

- Backend emitted a tool-call event with a request id.
- SDK runtime accepted the event for the active turn and claimed local execution.
- Main bridge sent a JSON-RPC request to the sidecar.
- Sidecar executed a registered tool and returned a JSON-serializable result.
- SDK runtime sent the result back to the backend with the original request id.
