---
summary: "Reference for the removed renderer `SurfaceOrchestrator`, `SystemStateCapture`, and `ToolComputerUseCatalog` services: stale symbol routing, current surviving artifact URL helpers, and Electron-main screenshot ownership."
read_when:
  - When a search, stack trace, or old plan mentions `SurfaceOrchestrator`, `prepareExternalFocusForCapture`, `SystemStateCapture`, `ToolComputerUseCatalog`, `ToolExecutionLogger`, or renderer `surfaceOrchestrator/*` modules.
  - When deciding whether screenshot hide/restore, capture prep, or computer-use post-action capture belongs in renderer infrastructure after the renderer services cleanup.
title: "Removed SurfaceOrchestrator Reference"
---

# Removed SurfaceOrchestrator Reference

## Removed Renderer Services

The current renderer infrastructure no longer contains these services:

- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/CorrelationId.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionLogger.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/**`

The matching frontend tests are also removed, including:

- `SurfaceOrchestrator*.test.ts`
- `SurfaceVisibilityRuntime.test.ts`
- `SystemStateCapture.test.ts`
- `ToolComputerUseCatalog.test.ts`
- `ToolExecutionLogger.test.ts`
- `CorrelationId.test.ts`

Do not use those files as current code or validation targets.

## Current Renderer Infrastructure Surface

The surviving renderer service files in this area are:

- `frontend/src/renderer/infrastructure/services/BackendEndpointStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`

Use [Capture, Artifact URL, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md) for renderer artifact URL composition, content-type normalization, and SDK/main resource materialization boundaries.

## Current Screenshot Ownership

Renderer infrastructure no longer owns screenshot hide/restore, surface mode
resolution, or computer-use post-action capture classification.

Current owner split:

- Electron main `surface_runtime.cjs` owns SDK-local screenshot-capture leases:
  Linux hide/restore and macOS/Windows content-protection toggles.
- `frontend/src/main/platform/screenshot_window_visibility/index.cjs` is a
  pass-through wrapper around the screenshot task.
- SDK/main owns post-action screenshot capture for local tool execution.
- Renderer chat and attachment code owns display and optimistic UI state, not
  native surface policy.

## Search Routing

If a stale reference points to:

- `SurfaceOrchestrator` or `prepareExternalFocusForCapture`: start with
  Electron main screenshot lease docs or renderer attachment docs, depending on
  whether the symptom is native capture policy or user-visible image state.
- `SystemStateCapture`: inspect the current chat/send resource path and SDK/main
  resource materialization before adding a renderer capture service back.
- `ToolComputerUseCatalog`: inspect SDK/main tool execution and post-action
  capture classification instead of adding renderer-side mode resolution.
- `ToolExecutionLogger`: inspect current tool-result streaming/logging owners
  before adding renderer infrastructure logging.

## Validation

Docs-only cleanup:

- `bin/windie docs search "SurfaceOrchestrator"`
- `bin/windie docs search "prepareExternalFocusForCapture"`
- `bin/windie docs list`
- `bin/windie test frontend -- WindieDocsIndex.test.cjs DocsListScript.test.cjs`

Runtime capture-policy changes:

- `tests/frontend/LocalBackendBridgeWindowVisibility.test.cjs`
- `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`
- `tests/frontend/SurfaceRuntime.test.cjs`
