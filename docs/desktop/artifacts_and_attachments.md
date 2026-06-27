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
- Query screenshot resource preparation: `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- SDK resource resolution: `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- SDK visual materialization: `packages/windie-sdk-js/src/runtime/VisualResourceMaterializer.ts`
- Attachment image async resolution: `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- Renderer attachment components: `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx` and `frontend/src/renderer/features/chat/components/message/content/AttachmentRendererRegistry.jsx`
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
- SDK display rows own live visual attachment projection through ordered
  `attachments[]` descriptors. User-included images may use volatile
  `previewSrc` only in live display projection; ready, replayed, and
  persisted attachments use artifact refs and lightweight metadata instead.
- Mixed visual sends order user-included images first and camera screenshot
  requests after them. Camera requests may display as pending placeholders
  until main/SDK materializes the artifact-backed screenshot.
- Preserve screenshot context across edit/resend and retry flows.
- Materialize user images, query screenshots, and tool screenshots through the
  SDK/main visual-resource materializer before backend payload assembly.
- Route trusted Electron-main screenshot temp files through the same
  materializer after main validates and reads the file bytes.
- Keep raw local screenshot temp-path validation and cleanup in Electron main;
  SDK query resolution does not trust or read `screenshot_path` values directly.
- Renderer user-message display rows consume SDK-owned `attachments[]` as the
  visual attachment contract. They do not infer primary user visuals from
  legacy `screenshot`, `screenshotRef`, `screenshotUrl`, or `screenshot_refs`
  fields.
- Tool-result display rows render through SDK-owned typed `attachments[]`
  descriptors. Backend/provider payload compatibility may still carry
  `screenshot_ref` or `screenshot_refs` until those durable contracts emit
  ordered `attachments[]`/`display_attachments` directly.
- Local tool results that include inline image bytes, including `read_file`
  image outputs with `screenshot` or `image_data`, must be materialized to
  artifact refs before SDK persistence. The model/backend delivery path may
  receive the visual through the normal tool-result contract, but persisted
  conversation events and replay/display metadata must store only
  `screenshot_ref`/`screenshot_url`, MIME metadata, and typed
  `attachments[]`/`display_attachments`, not raw base64.
- Backend websocket boundaries accept backend-safe `display_attachments`
  descriptors for tool-result, tool-bundle-result, rehydrate, and outgoing
  tool-output payloads. These descriptors are display/replay metadata only:
  backend model history and artifact hydration still use scoped artifact refs,
  and inline preview bytes or data URLs are rejected or stripped.
- Do not make app startup import upload IPC just to construct display image URLs.
- Hosted artifact uploads must include install auth headers when available.

## Migration

No user-data migration is required for SDK-owned live `attachments[]`
projection. Existing conversations replay through
`legacyVisualAttachmentReplayAdapter`, the narrow SDK/local replay adapter that
converts legacy screenshot metadata into ordered attachment descriptors; delete
that adapter after persisted rows and tool-result artifact payloads emit ordered
`attachments[]`/`display_attachments` directly.

## Deep Docs

- [Artifact Change Workflow](artifact_change_workflow.md)
- [Backend Artifact/Screenshot/System-State Flow Reference](../backend/services/artifact_screenshot_and_system_state_flow_reference.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Screenshot Message State and SDK Projection Reference](../frontend/renderer/transcript/screenshot_message_state_and_sdk_projection_reference.md)
- [API Reference](../reference/api_reference.md)
