---
summary: "Workflow for changing desktop Electron main-process behavior across IPC registration, windows, overlays, backend endpoint forwarding, permissions, local-runtime bridge, wakeword, and VM worker lifecycle."
read_when:
  - When changing Electron main-process startup, IPC handlers, preload channel exposure, window visibility, overlays, endpoint routing, SDK local-runtime host wiring, permission probes, wakeword bridge behavior, or VM worker mode.
  - When a renderer symptom may actually belong to Electron main orchestration, IPC transport, local-runtime host context, or platform window policy.
title: "Main Process Change Workflow"
---

# Main Process Change Workflow

Use this workflow when the change belongs to Electron main, not React renderer and not Python local-runtime implementation code. Electron main owns native desktop process orchestration: windows, overlays, tray/hotkeys, preload channel registration, renderer IPC handlers, SDK-runtime adaptation, endpoint defaults, SDK local-runtime launch facts/status consumers, platform permission probes, wakeword bridge startup, and VM worker polling.

Main process code is a trust boundary. It receives renderer requests through preload, talks to the hosted backend through SDK adapters, supplies local-runtime launch/context facts to the SDK, and calls platform APIs. Keep each of those responsibilities explicit instead of pushing native concerns into components or hiding malformed local-runtime/backend payloads in the UI.

## Fast Owner Map

| Symptom or request | Main-process owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| App startup, single-instance behavior, tray/hotkey registration, or quit cleanup changes | Main lifecycle runtime | `frontend/src/main/index.cjs`, `frontend/src/main/app/main_process_lifecycle_runtime.cjs`, `frontend/src/main/app/main_process_bootstrap_runtime.cjs` | `tests/frontend/MainProcessLifecycleRuntime.test.cjs`, `tests/frontend/MainProcessBootstrapRuntime.test.cjs` | [Main Process Lifecycle Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md) |
| Main window opens on wrong display, wrong mode, fullscreen, hidden state, or close behavior | Window visibility/control runtime | `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/surfaces/window_visibility_runtime.cjs`, `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/surfaces/main_window_controls_handler.cjs` | `tests/frontend/MainWindowRuntime.test.cjs`, `tests/frontend/WindowVisibilityRuntime.test.cjs`, `tests/frontend/WindowControlsIpcRuntime.test.cjs` | [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md), [Display-Affinity Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md) |
| Chat pill, response overlay, overlay phase, tool ghost, click-through, or capture prep changes | Overlay and surface runtimes | `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/surfaces/overlay_chatbox_handler.cjs`, `frontend/src/main/surfaces/overlay_responsebox_handler.cjs`, `frontend/src/main/surfaces/overlay_visibility_handler.cjs`, `frontend/src/main/surfaces/surface_runtime.cjs` | `tests/frontend/Overlay*.test.cjs`, `tests/frontend/ResponseOverlay*.test.*`, `tests/frontend/SurfaceRuntime.test.cjs` | [Main Overlay Focus Hub](overlays/README.md), [Response Overlay Policy](../../desktop/response_overlay.md) |
| New, renamed, or failing IPC channel | Shared registry, preload allowlist, main handler registration | `frontend/src/shared/ipcChannels.json`, `frontend/src/preload.js`, `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/*.cjs` | `tests/frontend/PreloadIpcChannels.test.cjs`, `tests/frontend/IpcBridge*.test.*`, focused `Ipc*.test.cjs` | [IPC Change Workflow](../ipc_change_workflow.md), [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md) |
| Query payload, Agent SDK runtime send, stop query, transcript session sync, or event replay changes | Query IPC and Electron agent host | `frontend/src/main/ipc.cjs`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `frontend/src/main/ipc/ipc_query_runtime.cjs`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs`, `frontend/src/main/ipc/ipc_event_replay_state.cjs` | `tests/frontend/AgentSdkClient.test.ts`, `tests/frontend/AgentSdkConversationRuntime.test.ts`, `tests/frontend/IpcQueryRuntime.test.cjs`, `tests/frontend/IpcMainBridge.query.test.cjs`, `tests/frontend/IpcTranscriptSessionSync.test.cjs` | [Query Payload and Relay](query_payload_and_relay_reference.md), [IPC Event Replay and Transcript Sync](ipc_event_replay_and_transcript_session_sync_reference.md) |
| Hosted/local/staging backend endpoint is wrong or local runtime sees a stale URL | Endpoint resolution and forwarding | `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`, `frontend/src/main/python/windie/_backend_config.py` | `tests/frontend/BackendEndpoints.test.cjs`, `tests/frontend/IpcSettingsSync.test.cjs`, `tests/sidecar/test_backend_config.py` | [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md), Runtime Configuration Matrix (private backend docs) |
| Local tool, memory, shell, browser, screenshot, or local-runtime call fails before reaching Python | SDK local-runtime bridge and mapper | `frontend/src/main/sidecar/local_runtime*.cjs`, `frontend/src/main/sidecar/local_runtime_supervisor.cjs`, `frontend/src/main/python/local_backend.py` | `tests/frontend/LocalRuntimeBridge*.test.cjs`, `tests/frontend/LocalRuntimeSupervisor.test.cjs`, `tests/sidecar/test_json_rpc_protocol.py` | [Main Local-Runtime Hub](local_backend/README.md), [Local Runtime Bridge Overview](local_runtime_bridge_handler_and_window_guard_reference.md) |
| Permission probe/request or onboarding permission status changes | Permission service and permission IPC runtime | `frontend/src/main/permissions/permission_service*.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`, `frontend/src/shared/permissions/permission_manifest.json` | `tests/frontend/PermissionService.test.cjs`, `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/permissionGrantEffects.test.js` | [Permission Manifest and IPC Contract](permission_manifest_probe_and_request_ipc_reference.md), [Permissions and Local Authority Workflow](../../security/permissions_and_local_authority_workflow.md) |
| Screenshot capture hides the wrong surfaces or platform capture differs | Screenshot/window visibility seam | `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`, SDK/main screenshot resource handling | `tests/frontend/LocalRuntimeWindowVisibility.test.cjs`, `tests/frontend/OverlayVisibilityHandler.test.cjs`, platform tests | [Linux Screenshot Hide/Restore Guard](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md), [Screenshot and Overlay Policy](../../platforms/screenshot_overlay_policy.md) |
| Wakeword startup, status, or bridge lifecycle changes | Wakeword bridge and supervisor | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`, `frontend/src/main/wakeword/wakeword_supervisor.cjs`, `frontend/src/main/python/wakeword_service.py` | `tests/frontend/WakewordBridge*.test.cjs`, `tests/frontend/WakewordSupervisor.test.cjs`, sidecar wakeword tests | [Wakeword Bridge Runtime Helper](wakeword_bridge_runtime_helper_reference.md), [Voice Audio Change Workflow](../../channels/voice_audio_change_workflow.md) |
| Hosted VM worker mode, run polling, or dashboard-only startup changes | Runtime mode and VM worker runtime | `frontend/src/main/app/runtime_mode.cjs`, `frontend/src/main/app/vm_worker_runtime.cjs`, `frontend/src/main/app/main_process_lifecycle_runtime.cjs` | `tests/frontend/RuntimeMode.test.cjs`, `tests/frontend/VmWorkerRuntime.test.cjs` | [VM Worker Runs Bridge](vm_worker_runs_bridge_runtime_reference.md), Automation Hub (private backend docs) |
| Packaged app resolves Python/script/resource path incorrectly | Runtime path resolver | `frontend/src/main/app/runtime_paths.cjs`, `frontend/electron-builder.bundled-python.yml`, `scripts/build-sidecar-runtime` | `tests/frontend/RuntimePaths.test.cjs`, package smoke checks | [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md), [Release and Packaging Workflow](../../operations/release_packaging_change_workflow.md) |

## Boundary Rules

- Renderer components must not call Electron APIs directly. Renderer access goes through preload and the typed IPC bridge.
- Preload must stay allowlist-driven by `frontend/src/shared/ipcChannels.json`; do not expose broad `ipcRenderer` handles.
- Main process should not implement business logic that belongs to backend agent/session/model code.
- Main process should not execute local tools directly. It should adapt host context and transport executable requests through the SDK local-runtime bridge, with local-runtime Python code remaining the concrete local executor.
- Main process owns native windows and platform side effects. Renderer should consume normalized state/events, not decide window flags, display placement, capture-time hiding, or OS permissions.
- Packaged mode must not fall back to source-only paths for local-runtime Python code or runtime.
- VM worker mode should not accidentally create overlay windows, tray icons, or hotkeys meant for the interactive desktop app.

## Change Sequence

1. **Classify the boundary.** Decide whether the behavior is renderer UI, preload exposure, main orchestration, SDK/main local execution, hosted backend, or platform OS policy.
2. **Read the closest workflow.** For IPC changes, read [IPC Change Workflow](../ipc_change_workflow.md). For packaged path changes, read [Release and Packaging Change Workflow](../../operations/release_packaging_change_workflow.md). For platform authority changes, read [Permissions and Local Authority Workflow](../../security/permissions_and_local_authority_workflow.md).
3. **Inspect the registrar or runtime module.** Main behavior is split across focused `*_runtime.cjs` and `src/main/ipc/*.cjs` modules; avoid adding new catch-all logic in `index.cjs`.
4. **Update producer and consumer together.** Channel registry, preload bridge, renderer constants, main handler, local-runtime mapper, Python JSON-RPC method, and docs must move together when the contract crosses boundaries.
5. **Keep platform differences explicit.** If macOS, Windows, and Linux differ, update platform adapters and tests rather than burying branches inside renderer code.
6. **Validate the narrowest boundary first.** Use main-process unit tests for runtime modules before manual Electron checks.
7. **Add packaged or manual smoke only when needed.** Window, permission, capture, and packaged path changes often need OS-level validation that Jest cannot prove.

## IPC and Preload Checklist

When adding or changing a renderer-main channel:

- Add the channel to `frontend/src/shared/ipcChannels.json` under the correct family.
- Keep renderer channel constants in sync.
- Use `invoke` for request/response or correlated work; use `send` only for fire-and-forget commands.
- Register the main handler in the focused IPC module, not an unrelated module.
- If Python is involved, update the local-runtime bridge mapper and local-runtime JSON-RPC handler together.
- Add registry/preload parity tests and handler/mapper tests.
- Update the domain doc that owns the behavior, not only the IPC workflow.

## Window and Overlay Checklist

When changing native windows or overlays:

- Keep display-affinity resolution centralized.
- Preserve VM-mode guards so hosted worker/dashboard contexts do not create interactive overlays.
- Keep capture-time hide/restore policy aligned with [Screenshot and Overlay Policy](../../platforms/screenshot_overlay_policy.md).
- Avoid mixing focus, visibility, click-through, transport, and renderer phase changes in one patch unless the state machine requires it.
- Add tests for hidden, visible, destroyed/missing window, target-display, and platform-specific behavior when relevant.

## Local Runtime Bridge Checklist

When changing SDK local-runtime bridge behavior:

- Decide whether the change is a new JSON-RPC method, a mapper change, a timeout/retry change, or a process lifecycle change.
- Keep request ids and readiness/error handling observable in main-process logs.
- Do not parse or reinterpret model-facing backend tool schemas in main. The bridge maps executable payloads for local-runtime execution.
- Keep screenshot/display/window helper shapes stable or update local-runtime Python tests and docs together.
- Add main bridge tests plus local-runtime JSON-RPC/tool tests backed by local-runtime Python coverage when Python payload shape changes.

## Endpoint and Runtime Path Checklist

When changing endpoints or packaged paths:

- Preserve precedence between explicit env vars, packaged defaults, hosted defaults, and local dev defaults.
- Keep backend URL forwarding to the local runtime explicit through config/env boundaries.
- In packaged mode, resolve Python and sidecar bytecode from app resources before any dev fallback.
- Validate both source mode and packaged mode when the change touches `runtime_paths.cjs`, Electron Builder resources, or `scripts/build-sidecar-runtime`.

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| IPC registry/preload/renderer bridge | `cd frontend && npm run test -- PreloadIpcChannels IpcBridge IpcBridgeValidation` |
| Main query/backend relay | `cd frontend && npm run test -- IpcQueryRuntime IpcMainBridge` |
| Overlay/window runtime | `cd frontend && npm run test -- MainWindow WindowVisibility Overlay SurfaceRuntime` |
| Permission service/IPC | `cd frontend && npm run test -- PermissionService PermissionIpcRuntime permissionGrantEffects` |
| Local runtime bridge | `cd frontend && npm run test -- LocalRuntimeBridge LocalRuntimeSupervisor` plus focused local-runtime JSON-RPC tests when Python payloads change |
| Wakeword bridge | `cd frontend && npm run test -- WakewordBridge WakewordSupervisor` plus sidecar wakeword tests when the Python service changes |
| Runtime paths/packaged launch | `cd frontend && npm run test -- RuntimePaths` plus target OS package smoke |
| Docs-only main workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing main-process work:

- Did the change belong in main rather than renderer, backend, preload, or sidecar?
- Did every IPC contract update the shared registry, preload exposure, renderer constants, main handler, and tests?
- Did platform/window changes keep OS-specific behavior explicit?
- Did packaged-mode changes avoid source-only fallbacks?
- Did local-runtime bridge changes preserve request correlation and implementation ownership?
- Did docs and `CHANGELOG.md` move with behavior or contract changes?

## Related Docs

- [Frontend Main Docs Hub](README.md)
- [IPC Change Workflow](../ipc_change_workflow.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
- [Main Process Lifecycle Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Main Local-Runtime Hub](local_backend/README.md)
- [Release and Packaging Change Workflow](../../operations/release_packaging_change_workflow.md)
