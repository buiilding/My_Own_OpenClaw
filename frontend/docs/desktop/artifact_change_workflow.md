---
summary: "Workflow for artifact and attachment changes across renderer screenshot resources, Electron IPC fetch/upload, backend artifact routes, query payloads, tool-result screenshots, replay, and SDK artifact access."
read_when:
  - When changing screenshot attachments, pasted images, artifact upload/fetch, `screenshot_ref`, image rendering, replay preservation, or SDK artifact routes.
  - When debugging missing screenshots, broken image URLs, stale artifact refs, multi-image payloads, or tool-result screenshots that do not reach backend history.
  - When deciding whether an artifact bug belongs in renderer, Electron main, backend routes, backend store, query execution, tool-result payloads, transcript replay, or SDK clients.
title: "Artifact Change Workflow"
---

# Artifact Change Workflow

Use this workflow before changing screenshot artifacts or attachments. Artifacts are the durable bridge between UI image state, backend model context, tool-result screenshots, transcript replay, and SDK/web clients.

For composer-specific attachment behavior, start with [Chat Attachment Change Workflow](../frontend/renderer/chat/chat_attachment_change_workflow.md). Use this page when the change crosses artifact upload/fetch, backend artifact storage, query artifact resolution, tool-result screenshots, replay, SDK, or web clients.

The normal pasted/selected image attachment path is:

1. renderer collects pasted images, selected files, or screenshot capture.
2. renderer sends typed SDK resources instead of uploading artifacts before the turn exists.
3. SDK/main resolves resources, materializes artifacts, and forwards refs.
4. backend stores the image and returns an artifact id.
5. renderer and replay paths use artifact refs plus URLs from the active backend endpoint.
6. backend resolves artifact refs into model image input.
7. transcript/replay stores refs, not raw binary.
8. artifact fetch routes serve images back to desktop/web clients.

Prefer artifact refs over passing raw base64 through long-lived state.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| pasted/selected image preview is wrong | renderer message input and attachment presentation | `frontend/src/renderer/features/chat/components/MessageInput.jsx`, `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`, `frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime.js` | [Message Send Surface Policy and Screenshot Capture Reference](../frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md) | `tests/frontend/MessageInput.test.jsx`, `tests/frontend/DesktopComposerAttachmentRuntime.test.js`, `tests/frontend/AttachmentPresentationRuntime.test.js` |
| query screenshot capture does not materialize or loses ref | renderer send resource request, SDK resource resolver, and main screenshot artifact bridge | `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`, `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`, `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs` | [Frontend Capture, Artifact URL, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md) | `tests/frontend/ChatMessageSender.test.tsx`, `tests/frontend/AgentSdkConversationRuntime.test.ts`, `tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs` |
| artifact URL points at wrong runtime endpoint | renderer artifact URL builder and main endpoint status | `frontend/src/renderer/app/runtime/desktopRuntimeEndpointClient.ts`, `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`, `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`, `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/ipc/ipc_artifact_fetch.cjs` | [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md), Configuration Change Workflow (private backend docs) | `tests/frontend/RuntimeEndpointStore.test.ts`, `tests/frontend/IpcArtifactFetch.test.cjs`, endpoint tests |
| backend upload/fetch route fails | backend artifact route and store | `backend/src/api/routes/artifacts`, `backend/src/services/artifacts` | Backend Artifact Service Docs Hub (private backend docs) | `tests/backend/test_artifact_routes.py`, `tests/backend/test_artifacts_store.py` |
| query payload lacks image context | renderer sender and backend query input resolver | `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`, `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`, `backend/src/api/services/query_execution_support/query_execution_inputs.py` | Query Lifecycle Change Workflow (private backend docs) | `tests/frontend/ChatMessageSender.test.tsx`, `tests/backend/test_query_execution_inputs.py` |
| tool-result screenshot is stripped or not stored | SDK/main result envelope and backend tool-result router | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/transport/backendPayloadContract.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `backend/src/agent/tools/waiting/router.py` | Tool Turn Change Workflow (private backend docs), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) | SDK/main result-envelope tests, backend tool-result tests |
| replayed chat image is missing | SDK replay adapter, renderer transcript projection, and attachment image resolver | `packages/windie-sdk-js/src/projections/legacyVisualAttachmentReplayAdapter.ts`, `frontend/src/renderer/infrastructure/transcript`, `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`, SDK/local-runtime transcript store backed by local-runtime Python modules | [Memory Change Workflow](../memory/memory_change_workflow.md), [Transcript and Replay](../memory/transcript_and_replay.md) | frontend transcript/message attachment tests, SDK/local-runtime transcript tests |
| SDK or web client cannot fetch artifact | hosted artifact routes and SDK client wrappers | `backend/src/api/routes/artifacts`, `backend/src/sdk`, `packages/windie-sdk-js` | [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md), [Web Client Integration](../web/web_client_integration.md) | backend artifact route tests, SDK client tests |

## Ownership Rules

- Renderer owns image selection, local preview, query screenshot resource requests, display URL construction, and optimistic message state.
- SDK/main own query screenshot capture, artifact materialization, and post-action screenshot result merging.
- Electron main owns local IPC bridges for artifact upload/fetch and backend endpoint propagation.
- Backend artifact routes own upload/fetch HTTP contracts, auth, content type, size limits, and error mapping.
- Backend artifact store owns id validation, streaming writes, base64 lookup, and filesystem layout.
- Backend query execution owns normalizing `screenshot_ref`/`screenshot_refs`; prompt construction owns resolving refs into bounded model image input.
- Tool-result payload builders own stripping raw image data and forwarding refs.
- Transcript/replay owns durable refs and should avoid persisting large binary payloads.

## Change Sequence

1. Identify whether the change affects selection/preview, upload, fetch, query payload, tool-result payload, backend route/store, or replay.
2. Read the owner deep reference and one downstream consumer doc.
3. Preserve both compatibility fields and multi-image fields when changing query payloads:
   - `screenshot_ref` for the primary image.
   - `screenshot_refs` for all uploaded images.
4. Keep raw base64 out of long-lived transcript/replay rows when an artifact ref exists.
5. Update backend route/store tests when upload/fetch behavior changes.
6. Update renderer tests when preview, URL, upload fallback, or optimistic message state changes.
7. Update query/tool-result tests when backend-bound payload shape changes.
8. Update docs and changelog in the same commit.

## Renderer Attachment Changes

Use this path when the user-visible image/file picker or optimistic row changes.

Primary files:

- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx`
- `frontend/src/renderer/app/runtime/desktopRuntimeEndpointClient.ts`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`

Validation:

- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/DesktopComposerAttachmentRuntime.test.js`
- `tests/frontend/AttachmentPresentationRuntime.test.js`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/MessageContent.test.jsx`

Rules:

- Preview state can use blob/data URLs, but durable state should prefer artifact refs.
- Multi-image UI must keep per-image filename/content type where available.
- Renderer send should submit typed SDK resources instead of pre-uploading query screenshots.
- The first artifact ref remains the compatibility `screenshot_ref`.

## Electron IPC and Endpoint Changes

Use this path when artifact upload/fetch crosses the desktop IPC boundary or needs endpoint data.

Primary files:

- `frontend/src/main/ipc/ipc_artifact_fetch.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/renderer/app/runtime/desktopRuntimeEndpointClient.ts`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`

Validation:

- `tests/frontend/IpcArtifactFetch.test.cjs`
- `tests/frontend/RuntimeEndpointStore.test.ts`
- endpoint resolver tests when URL behavior changes.

Rules:

- Hosted artifact calls must include install auth where required.
- URL construction should use the active backend HTTP base URL.
- Renderer app providers and runtime clients should use
  `DesktopRuntimeEndpointClient` instead of importing the endpoint store
  directly.
- Renderer feature code should use `DesktopArtifactRuntimeClient.buildArtifactUrl(...)`
  instead of importing the endpoint store directly.
- Renderer feature code should use `DesktopArtifactRuntimeClient` for
  screenshot attachment normalization, artifact ref inference, and artifact
  image content-type or extension parsing instead of importing renderer service
  helpers directly.
- Do not import artifact upload IPC code during app startup only to build display URLs.

## Backend Artifact Route and Store Changes

Use this path when upload/fetch HTTP behavior, validation, size limits, or storage layout changes.

Primary files:

- `backend/src/api/routes/artifacts/router.py`
- `backend/src/api/routes/artifacts/models.py`
- `backend/src/services/artifacts/store.py`

Validation:

- `tests/backend/test_artifact_routes.py`
- `tests/backend/test_artifacts_store.py`
- auth/hosted route tests if access policy changes.

Rules:

- Validate artifact ids before reading from disk.
- Preserve content type and extension semantics.
- Keep route errors sanitized and useful.
- Do not expose arbitrary filesystem paths through artifact ids.

## Query and Tool-Result Payload Changes

Use this path when backend-bound payloads change.

Primary files:

- `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/src/transport/backendPayloadContract.ts`
- `backend/src/api/services/query_execution_support/query_execution_inputs.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/processing/**`

Validation:

- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/BackendSdkWebsocketContract.test.cjs`
- `tests/backend/test_query_execution_inputs.py`
- backend tool-result router/receiver/storage tests.

Rules:

- Strip inline binary fields from backend-bound tool-result data when a ref exists.
- Preserve `capture_meta` with screenshots when downstream coordinate logic needs it.
- Keep `system_state_internal` separate from public `system_state`.
- Preserve model-facing history safety for tool outputs and replay.

## Replay and Memory Changes

Use this path when artifacts must survive reload, retry, edit, compaction, or chat deletion.

Start docs:

- [Memory Change Workflow](../memory/memory_change_workflow.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Frontend Renderer Transcript Hub](../frontend/renderer/transcript/README.md)

Validation:

- frontend transcript and message rendering tests.
- sidecar transcript/replay tests.
- sidecar FAISS/artifact cleanup tests if deletion semantics change.

Rules:

- Store refs and display metadata, not large raw image blobs, when possible.
- Delete/reset flows should account for orphaned artifact/index state when the owning transcript rows are removed.
- Replay should rehydrate enough image metadata for renderer display and backend context.

## Review Checklist

- The change identifies the artifact owner stage.
- `screenshot_ref` legacy single-image path still works.
- `screenshot_refs` multi-image path still works.
- Hosted uploads/fetches include required auth.
- URLs use active runtime HTTP base URL.
- Raw binary data is not persisted unnecessarily.
- Query and tool-result payloads preserve screenshot/capture metadata needed by backend logic.
- Tests cover producer and consumer sides of any payload change.

## Related Docs

- [Artifacts and Attachments](artifacts_and_attachments.md)
- [Chat Attachment Change Workflow](../frontend/renderer/chat/chat_attachment_change_workflow.md)
- Backend Artifact Service Docs Hub (private backend docs)
- Backend Artifact, Screenshot, and System-State Flow Reference (private backend docs)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- Query Lifecycle Change Workflow (private backend docs)
- Tool Turn Change Workflow (private backend docs)
