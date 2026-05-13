---
summary: "Artifacts and attachments guide covering screenshot upload, artifact refs, image display, replay preservation, and backend artifact routes."
read_when:
  - When changing screenshot attachments, artifact upload/fetch paths, image rendering, replay preservation, or artifact routes.
  - When debugging missing or stale screenshot/image context.
title: "Artifacts and Attachments"
---

# Artifacts and Attachments

WindieOS uses artifacts to avoid passing large binary screenshots directly through every layer. The renderer and main process upload images; the backend stores and serves them by artifact id.

## Main Files

- Renderer uploader: `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- Screenshot pipeline: `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- Message screenshot resolution: `frontend/src/renderer/features/chat/utils/message/useResolvedMessageScreenshots.js`
- Main screenshot artifact bridge: `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
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
- Do not make app startup import upload IPC just to construct display image URLs.
- Hosted artifact uploads must include install auth headers when available.

## Deep Docs

- [Backend Artifact/Screenshot/System-State Flow Reference](../backend/services/artifact_screenshot_and_system_state_flow_reference.md)
- [Frontend Capture, Artifact Upload, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [API Reference](../reference/api_reference.md)
