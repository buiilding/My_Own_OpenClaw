---
summary: "Workflow for safely adding, changing, or removing WindieOS Electron IPC channels across shared registry, preload allowlist, main handlers, renderer bridge, and tests."
read_when:
  - When adding, renaming, deleting, or repurposing an Electron IPC channel.
  - When debugging invoke/send/on drift between preload, renderer constants, and main-process handlers.
  - When a frontend change crosses renderer, preload, Electron main, or sidecar bridge boundaries.
title: "IPC Change Workflow"
---

# IPC Change Workflow

WindieOS IPC is a trust boundary. The renderer can only use channels exposed by preload, and preload receives its allowlist from the shared channel registry passed by the main process. Do not add ad hoc `ipcRenderer` access to renderer code.

## Source of Truth

| Surface | Code | Role |
| --- | --- | --- |
| Shared channel registry | `frontend/src/shared/ipcChannels.json` | Canonical channel names grouped by `SEND_CHANNELS`, `INVOKE_CHANNELS`, and `ON_CHANNELS`. |
| Preload allowlist | `frontend/src/preload.js` | Loads registry from `--windie-ipc-channels=...`, gates send/invoke/on/once calls, strips Electron event objects. |
| Renderer constants | `frontend/src/renderer/infrastructure/ipc/channels.ts` | Typed channel constants derived from the shared JSON registry. |
| Renderer wrapper | `frontend/src/renderer/infrastructure/ipc/bridge.ts` | Typed `IpcBridge` helper used by renderer features and infrastructure. |
| Main handler surface | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/*.cjs` | Registers handlers, backend relay, overlay channels, settings sync, memory, artifacts, permissions, and query events. |
| Local sidecar bridge | `frontend/src/main/local_backend_bridge*.cjs` | Maps invoke handlers to Python JSON-RPC where local execution is required. |

## Channel Type Decision

| Need | Channel family | Rule |
| --- | --- | --- |
| Renderer emits fire-and-forget command to main | `SEND_CHANNELS` | Use only when renderer does not need a result and main can tolerate duplicate or late delivery. |
| Renderer asks main for a result | `INVOKE_CHANNELS` | Prefer for local tool execution, config loads, permission probes, memory operations, artifact upload/fetch, and window commands needing success/failure. |
| Main broadcasts events to renderer | `ON_CHANNELS` | Use for backend stream ingress, local-backend status, overlay phase, wakeword status, workspace updates, and window open targets. |

If a request/response needs correlation, use `invoke` or include an explicit id in the payload. Do not rely on event ordering across unrelated channels.

## Add a Channel

1. Add the channel name to `frontend/src/shared/ipcChannels.json` under the right family.
2. Update `frontend/src/renderer/infrastructure/ipc/channels.ts` type shape if the channel registry type is explicit.
3. Add or update renderer helper code so feature components do not call raw `window.ipc`.
4. Register the main handler or broadcaster in `frontend/src/main/ipc.cjs` or a focused `frontend/src/main/ipc/*.cjs` module.
5. If the channel reaches Python, add or update mapper code in `local_backend_bridge_rpc_mappers.cjs` or the local backend bridge module that owns the behavior.
6. Add tests for registry/preload parity plus the handler or bridge behavior.
7. Update docs for the affected domain, not only this workflow.

## Change or Remove a Channel

| Change | Required checks |
| --- | --- |
| Rename | Update shared registry, renderer constants, renderer usage, preload tests, main handler tests, and any transcript/replay references. |
| Payload shape change | Update renderer caller, main handler, sidecar mapper if involved, backend-bound payload docs, and focused validation tests. |
| Handler move | Keep channel name stable, move implementation, and update ownership docs. |
| Removal | Delete registry entry, renderer usage, main handler, tests, and docs. Do not leave dead channels in preload. |

Do not keep compatibility shims unless there is a verified packaged-app, transcript replay, or external client dependency.

## Common Failure Signals

| Symptom | First owner to inspect |
| --- | --- |
| Renderer `invoke` rejects with invalid channel | Shared registry or preload registry argument. |
| TypeScript accepts channel but runtime rejects it | `channels.ts` type shape drift from `ipcChannels.json`. |
| Handler never runs | Missing `ipcMain.handle`/`ipcMain.on` registration or wrong channel family. |
| Event listener gets stale data | Main broadcaster, replay state, or renderer cleanup leak. |
| Packaged app differs from dev | Main process channel registry injection or preload path/build packaging. |
| Sidecar tool call returns unexpected payload | Local backend bridge mapper or Python JSON-RPC handler. |

## Test Targets

| Behavior | Tests |
| --- | --- |
| Preload allowlist and registry parity | `tests/frontend/PreloadIpcChannels.test.cjs`, `tests/frontend/IpcBridge.test.ts`, `tests/frontend/IpcBridgeValidation.test.ts` |
| Main query/backend relay | `tests/frontend/IpcMainBridge.query.test.cjs`, `tests/frontend/IpcMainBridge.lifecycle.test.cjs`, `tests/frontend/IpcQueryRuntime.test.cjs` |
| Settings, transcript, memory, artifacts | `tests/frontend/IpcSettingsSync.test.cjs`, `tests/frontend/IpcTranscriptSessionSync.test.cjs`, `tests/frontend/IpcMemoryStorePersistence.test.cjs`, `tests/frontend/IpcArtifactFetch.test.cjs` |
| Overlay and window channels | `tests/frontend/IpcOverlayPhase*.test.cjs`, `tests/frontend/Overlay*.test.cjs`, `tests/frontend/MainWindow*.test.cjs` |
| Local backend bridge | `tests/frontend/LocalBackendBridge*.test.cjs`, `tests/sidecar/test_json_rpc_protocol.py` |

## Related Docs

- [Frontend Contracts IPC Docs Hub](contracts/ipc/README.md)
- [Preload Channel Allowlist and Renderer Bridge Reference](preload/preload_channel_allowlist_and_renderer_bridge_reference.md)
- [IPC Channel and Handler Reference](contracts/ipc_channel_and_handler_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md)
