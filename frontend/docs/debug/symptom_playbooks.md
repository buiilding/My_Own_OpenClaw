---
summary: "Symptom-based debug playbooks mapping WindieOS failures to owner modules, docs, and validation commands."
read_when:
  - When a bug report names a symptom rather than a subsystem.
  - When deciding where an agent should inspect or modify code for a failure.
title: "Symptom Playbooks"
---

# Symptom Playbooks

Use these playbooks to avoid editing the wrong layer.

## No Backend Response

Likely boundary: Agent SDK runtime, Electron main query preparation, or hosted backend websocket.

Inspect:

- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/services/query_execution.py`

Docs:

- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Agent Loop](../concepts/agent_loop.md)
- Backend API Docs Hub (private backend docs)

Validate:

```bash
<windie> test backend tests/backend/test_websocket_route.py tests/backend/test_websocket_task_manager.py -q
<windie> test frontend -- IpcQueryRuntime.test.cjs IpcSettingsSync.test.cjs
```

## Model Or Provider Missing

Likely boundary: backend provider registration, model catalog, credentials, or renderer settings reconciliation.

Inspect:

- `backend/src/llm/providers/factory.py`
- `backend/src/llm/models/models_config.py`
- `backend/src/llm/models/model_service.py`
- `backend/src/core/config/loader.py`
- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`

Docs:

- [Providers Hub](../providers/README.md)
- [Models and LLM Providers](../providers/models.md)
- Provider Credentials (private backend docs)

Validate:

```bash
<windie> test backend tests/backend/test_model_service.py tests/backend/test_models_config.py tests/backend/test_provider_factory_helpers.py -q
<windie> test frontend -- ModelSelectionUtils.test.js ModelsSection.test.jsx
```

## Tool Call Appears But Does Not Execute

Likely boundary: backend tool event, Agent SDK tool routing, Electron main bridge, or local-runtime tool registration backed by the Python implementation registry.

Inspect:

- `backend/src/tools/tool_catalog.py`
- `backend/src/agent/tools`
- `packages/windie-sdk-js/src/runtime`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/main/python/tools/registry.py`

Docs:

- [Tool Contracts](../tools/tool_contracts.md)
- [Tools Hub](../tools/README.md)
- [Runtime Traces](runtime_traces.md)

Validate:

```bash
<windie> test backend tests/backend/test_remote_tool_contract.py tests/backend/test_tool_result_handler.py -q
<windie> test frontend -- AgentSdkConversationRuntime AgentSdkClient RendererToolResultBoundary ToolOutputContent
<windie> test local-runtime tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_result.py -q
```

## Screenshot Or Coordinate Grounding Wrong

Likely boundary: overlay visibility, screenshot capture, OCR/vision provider, coordinate scaling, or artifact replay.

Inspect:

- `frontend/src/main/surfaces/surface_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `frontend/src/main/python/tools/computer/screenshot_tool.py`
- `backend/src/services/ocr`
- `backend/src/services/vision`
- `backend/src/agent/tools/preparation/coordinate_resolution`

Docs:

- [Computer Tools](../tools/computer.md)
- [Artifacts and Attachments](../desktop/artifacts_and_attachments.md)
- [OCR and Vision SDK](../sdk/ocr_and_vision.md)
- [Linux Platform Guide](../platforms/linux.md)

Validate:

```bash
<windie> test backend tests/backend/test_coordinate_scaling.py tests/backend/test_ocr_coordinate_resolver.py tests/backend/test_vision_coordinates.py -q
<windie> test frontend -- LocalRuntimeWindowVisibility.test.cjs QueryScreenshotPipeline.test.ts ChatMessageSender.test.tsx AgentSdkConversationRuntime.test.ts
<windie> test local-runtime tests/sidecar/test_screenshot_tool.py -q
```

## Minimal Chat Pill Flickers Or Sticks

Likely boundary: response overlay phase, window visibility, capture focus, or renderer awaiting latch.

Inspect:

- `frontend/src/shared/response_overlay_phase_contract.json`
- `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`
- `frontend/src/main/surfaces/surface_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`

Docs:

- [Minimal Chat Pill](../desktop/minimal_chat_pill.md)
- [Response Overlay](../desktop/response_overlay.md)
- [Runtime Traces](runtime_traces.md)

Validate:

```bash
<windie> test frontend -- OverlayPhaseContractParity.test.js ResponseOverlayPhaseContract.test.js ChatBoxResponse.state.test.jsx LiveTurnSurfaceState.test.js ChatBoxPillLayout.test.js
```

## Permissions Gate Does Not Match OS State

Likely boundary: Electron permission service, OS probe, renderer onboarding state, or stored permission state.

Inspect:

- `frontend/src/shared/permissions/permission_manifest.json`
- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/permissions/permission_service_screen_capture.cjs`
- `frontend/src/main/permissions/permission_service_input_control.cjs`
- `frontend/src/main/permissions/permission_service_microphone.cjs`
- `frontend/src/main/permissions/permission_service_browser.cjs`
- `frontend/src/renderer/features/permissions`
- `frontend/src/renderer/features/onboarding`

Docs:

- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)
- [macOS Platform Guide](../platforms/macos.md)

Validate:

```bash
<windie> test frontend -- PermissionService.test.cjs PermissionIpcRuntime.test.cjs AppPermissionGate.test.jsx useOnboardingPermissionActions.test.jsx
```

## Voice Or Wakeword Does Not Trigger

Likely boundary: renderer microphone flow, Electron wakeword bridge, local-runtime wakeword service backed by Python, or backend transcription websocket.

Inspect:

- `frontend/src/renderer/features/voice`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/wakeword/wakeword_supervisor.cjs`
- `frontend/src/main/python/wakeword_service.py`
- `backend/src/api/routes/transcription/router.py`
- `backend/src/api/services/transcription`

Docs:

- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Validate:

```bash
<windie> test frontend -- WakewordBridge.test.cjs WakewordSupervisor.test.cjs VoiceModeHook.test.ts TranscriptionHook.test.ts
<windie> test backend tests/backend/test_transcription_gateway.py tests/backend/test_openai_realtime_transcription.py -q
<windie> test local-runtime tests/sidecar/test_wakeword_service.py -q
```

## Browser Automation Fails

Likely boundary: backend schema, local-runtime browser adapter backed by the Browser Use CLI, Chromium runtime availability, Browser Use session state, or permission probe.

Inspect:

- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote_tools/browser.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/permissions/permission_service_browser.cjs`

Docs:

- [Browser Tool](../tools/browser.md)
- [Browser Control](../browser/browser_control.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)

Validate:

```bash
<windie> test backend tests/backend/test_browser_remote_tool.py -q
<windie> test local-runtime tests/sidecar/test_browser_registry.py tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine_runtime.py -q
<windie> test frontend -- ChatBrowserSessionControl.test.jsx PermissionService.test.cjs
```
