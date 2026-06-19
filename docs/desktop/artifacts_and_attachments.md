---
summary: "Artifacts and attachments guide covering screenshot upload, artifact refs, image display, replay preservation, and backend artifact routes."
read_when:
  - When changing screenshot attachments, artifact upload/fetch paths, image rendering, replay preservation, or artifact routes.
  - When debugging missing or stale screenshot/image context.
title: "Artifacts and Attachments"
---

# Artifacts and Attachments

WindieOS uses artifacts to avoid passing large binary screenshots directly through every layer. The renderer prepares typed image resources and display URLs, SDK/main materializes artifacts, and the backend stores and serves them by artifact id.

## Main Files

- Renderer artifact URL builder: `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`
- Query screenshot resource preparation: `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
- SDK resource resolution: `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- SDK visual materialization: `packages/windie-sdk-js/src/runtime/VisualResourceMaterializer.ts`
- Message screenshot descriptors: `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`
- Message screenshot async image resolution: `frontend/src/renderer/features/chat/utils/message/useResolvedMessageScreenshots.js`
- Main screenshot artifact bridge: `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- Backend routes: `backend/src/api/routes/artifacts/*`
- Backend store: `backend/src/services/artifacts/store.py`

## Payload Concepts

- `screenshot_ref`: durable artifact id for backend/user identity scoped lookup
- `screenshot_url`: URL to fetch an artifact image
- inline screenshot data: fallback path when no artifact ref is available
- artifact metadata: backend ownership and content-type state

## Rules

- Prefer artifact refs for replay-safe screenshot context.
- Preserve screenshot context across edit/resend and retry flows.
- Materialize user images, query screenshots, and tool screenshots through the
  SDK/main visual-resource materializer before backend payload assembly.
- Route trusted Electron-main screenshot temp files through the same
  materializer after main validates and reads the file bytes.
- Keep raw local screenshot temp-path validation and cleanup in Electron main;
  SDK query resolution does not trust or read `screenshot_path` values directly.
- Renderer display rows treat `screenshot` as inline image data only; remote
  artifact images must carry explicit `screenshotRef`/`screenshotUrl` metadata
  or `screenshot_refs`.
- Do not make app startup import upload IPC just to construct display image URLs.
- Hosted artifact uploads must include install auth headers when available.

## Deep Docs

- [Artifact Change Workflow](artifact_change_workflow.md)
- [Backend Artifact/Screenshot/System-State Flow Reference](../backend/services/artifact_screenshot_and_system_state_flow_reference.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Screenshot Message State and SDK Projection Reference](../frontend/renderer/transcript/screenshot_message_state_and_sdk_projection_reference.md)
- [API Reference](../reference/api_reference.md)
