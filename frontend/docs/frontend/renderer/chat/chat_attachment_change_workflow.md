---
summary: "Workflow for changing desktop chat attachments across MessageInput paste/file picker behavior, typed SDK turn resources, host resource resolution, query payload assembly, backend query resolution, and replay."
read_when:
  - When changing pasted-image, file-picker, readable-file, screenshot attachment, artifact upload, or attachment filename behavior in chat.
  - When a user image/file appears in the composer but is missing from the SDK row metadata, backend query, transcript replay, or model context.
  - When deciding whether an attachment bug belongs to MessageInput, chat sender payload normalization, SDK turn resource resolution, Electron query IPC, backend query input resolution, transcript replay, or artifact routes.
title: "Chat Attachment Change Workflow"
---

# Chat Attachment Change Workflow

Use this workflow for user-provided chat attachments: pasted images, selected image files, selected readable files, and optional query screenshots. It is narrower than [Artifact Change Workflow](../../../desktop/artifact_change_workflow.md), which also covers backend artifact storage, SDK access, and tool-result screenshots.

The core rule is: the composer owns selection and preview; renderer send preparation owns typed resource handles only; SDK `conversation.send` owns resource resolution, user-row metadata, and backend payload assembly. Transcript/replay should preserve durable refs and visible filenames, not raw file contents.

## Runtime Path

```mermaid
flowchart LR
    A["MessageInput paste or file picker"] --> B["clipboardImages and readableFiles state"]
    B --> C["DesktopMessageInputRuntime.buildOutgoingMessage"]
    C --> D["useChatMessageSender"]
    D --> E["typed TurnInputResource handles"]
    E --> F["DesktopLiveTurnRuntimeClient.sendQuery"]
    F --> G["Electron query IPC preserves SDK-only resources"]
    G --> H["SDK ConversationRuntime base user row"]
    H --> I["SDK DefaultTurnResourceResolvers"]
    I --> J["backend-compatible payload fields"]
    J --> K["Backend query_execution_inputs"]
    K --> L["model image/content context"]
    H --> M["SDK display rows and continuity replay helpers"]
```

## Fast Owner Map

| Symptom | First owner | Inspect first | Then inspect |
| --- | --- | --- | --- |
| Pasted image is not previewed | Composer paste parsing | `MessageInput.jsx`, `desktopComposerAttachmentRuntime.js` | `tests/frontend/MessageInput.test.jsx`, `DesktopComposerAttachmentRuntime.test.js` |
| Selected image file is treated like readable text | File attachment bucketing | `desktopComposerAttachmentRuntime.js`, `desktopAttachmentPresentationRuntime.js`, `MessageInput.jsx` | `DesktopComposerAttachmentRuntime.test.js`, `MessageInput.test.jsx`, `AttachmentPresentationRuntime.test.js` |
| Readable file appears as a chip but model never sees content | SDK turn resource pipeline | `desktopChatSendPreparationRuntime.ts`, `DefaultTurnResourceResolvers.ts`, `ContextEnrichmentPipeline.ts` | local-runtime `read_file` behavior and SDK runtime tests |
| Attachment-only send is blocked | Composer outgoing payload builder | `desktopMessageInputRuntime.js`, `MessageInput.jsx` | `DesktopMessageInputRuntime.test.js`, `MessageInput.test.jsx` |
| Send failure clears text or attachment previews | Composer draft lifecycle | `useChatComposerDraft.js`, `MessageInput.jsx` | `ChatComposerDraft.test.jsx`, `MessageInput.test.jsx` |
| SDK user row lacks filename chips | SDK turn resource resolution and metadata | `desktopChatSendPreparationRuntime.ts`, `DefaultTurnResourceResolvers.ts`, `ConversationRuntime.ts` | `ChatMessageSender.test.tsx`, `AgentSdkConversationRuntime.test.ts` |
| Uploaded image has wrong content type or URL | SDK artifact resolver | `DefaultTurnResourceResolvers.ts`, `ArtifactImageUtils.ts` | `AgentSdkConversationRuntime.test.ts`, artifact tests |
| Query sends only one of multiple images | SDK clipboard image resources | `desktopChatSendPreparationRuntime.ts`, `DefaultTurnResourceResolvers.ts` | `ChatMessageSender.test.tsx`, SDK runtime tests |
| Electron query payload drops attachment resources | Main query IPC runtime and SDK enrichment | `frontend/src/main/ipc/ipc_query_runtime.cjs`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts` | `IpcQueryRuntime.test.cjs`, `AgentSdkContextEnrichment.test.ts` |
| Backend receives refs but model gets no image | Backend query input resolution | `backend/src/api/services/query_execution_support/query_execution_inputs.py` | `tests/backend/test_query_execution_inputs.py`, artifact route/store tests |
| Replayed message loses images | SDK replay adapter, typed attachment projection, and artifact image resolver | `legacyVisualAttachmentReplayAdapter.ts`, `desktopSdkDisplayAttachmentProjection.ts`, `desktopSdkDisplayChatMessageProjectionRuntime.ts`, `desktopAttachmentImageRuntime.js`, transcript replay state | `AgentSdkConversationRuntime.test.ts`, `DesktopSdkDisplayAttachmentProjection.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `MessageContent.test.jsx`, SDK rehydrate projection tests, transcript tests |
| Artifact image fails once and never recovers | App-runtime-backed attachment image cache | `desktopArtifactRuntimeClient.ts`, `desktopAttachmentImageRuntime.js` | `MessageContent.test.jsx` retry-after-failure coverage |
| Copy image to clipboard fails | Electron image interaction IPC | `frontend/src/main/ipc/ipc_image_interaction_handlers.cjs`, `frontend/src/main/ipc/ipc_clipboard_image.cjs` | `IpcImageInteractionHandlers.test.cjs`, `IpcClipboardImageHandler.test.cjs` |

Clipboard image IPC trust boundary:

- the renderer may request copy/context-menu actions, but main process only
  decodes bounded `data:image/*` payloads or fetches trusted backend artifact
  URLs under `/api/artifacts/...`
- main-process image fetches validate redirects, response size, and image
  content type before writing to the native clipboard

## Change Sequence

1. Classify the attachment source.
   - Pasted image: `clipboardImages[]`.
   - Selected image file: image bucket that becomes `clipboardImages[]`.
   - Selected readable file: `readableFiles[]`.
   - Query screenshot: sender-triggered screenshot capture, not a composer preview.

2. Preserve composer payload shape.
   - `DesktopMessageInputRuntime.buildOutgoingMessage(...)` may return a string for text-only sends.
   - It must return an object payload when images or readable files are attached.
   - Attachment-only sends should use the existing fallback text rather than blocking submission.
   - Clear the composer draft immediately after local send acceptance so renderer
     inputs do not wait on SDK resource preparation; rejected async sends must
     restore the captured text, pasted images, and selected readable files for
     retry.

3. Preserve image handles.
   - Keep `base64`, `contentType`, `filename`, and `previewUrl` through composer preview.
   - Renderer send should submit `clipboard_image` resources without uploading artifacts.
   - SDK resource resolvers upload images, preserve content type, and choose a deterministic filename when none is provided.

4. Preserve readable-file behavior.
   - Non-image selected files become visible filename chips.
   - Renderer send submits `readable_file` resources with file path and filename.
   - SDK resource resolvers use the local-runtime `read_file` tool to build hidden `attachment_context`.
   - Raw file content should not appear in the visible user row.
   - Required file read failures become SDK turn errors after the base user row
     appears, so the renderer does not block row emission.

5. Preserve backend-bound compatibility fields at SDK payload assembly.
   - `screenshot_ref`: primary image ref for compatibility.
   - `screenshot_refs`: deduped list of uploaded refs for multi-image queries.
   - SDK display metadata must preserve `screenshot_refs` as compatibility input
     and adapt it into ordered typed `attachments[]` before renderer projection.
   - `attachment_context`: hidden readable-file context.
   - `attachment_filenames`: visible filename list derived during SDK resource
     resolution for user row/query metadata.

6. Update docs and tests at the producer and consumer.
   - Composer change: update MessageInput/utility tests.
   - Sender change: update ChatMessageSender and payload tests.
   - Artifact change: update screenshot/artifact tests and artifact workflow docs.
   - Query payload change: update Electron IPC and backend query input tests.
   - Replay change: update transcript/replay and message screenshot tests.

## Validation Matrix

| Change type | Focused validation |
| --- | --- |
| Clipboard image paste/preview/remove | `cd frontend && npm run test -- MessageInput ClipboardImageUtils` |
| File picker image/readable bucketing | `cd frontend && npm run test -- MessageInput FileAttachmentUtils` |
| Outgoing composer payload shape | `cd frontend && npm run test -- DesktopMessageInputRuntime MessageInput` |
| Sender payload normalization | `cd frontend && npm run test -- DesktopChatSendPayloadRuntime DesktopChatSendStateRuntime` |
| Sender upload/query payload path | `cd frontend && npm run test -- ChatMessageSender AgentSdkConversationRuntime RuntimeEndpointStore ArtifactImageUtils` |
| Main-process query payload normalization | `cd frontend && npm run test -- IpcQueryRuntime` |
| Backend screenshot/query input resolution | `./scripts/python-in-env backend pytest tests/backend/test_query_execution_inputs.py` |
| Artifact route/store behavior | `./scripts/python-in-env backend pytest tests/backend/test_artifact_routes.py tests/backend/test_artifacts_store.py` |
| Replay/message image rendering | `<windie> test frontend -- AgentSdkConversationRuntime SdkDisplayChatMessageProjection MessageContent DesktopAttachmentImageRuntime` |
| Clipboard copy IPC | `cd frontend && npm run test -- IpcClipboardImageHandler` |
| Docs-only attachment workflow | `<windie> docs list`, `git diff --check`, focused Markdown link check |

## Debug Playbooks

### Composer Shows an Image but Backend Does Not See It

1. Confirm `MessageInput` sends an object payload with `clipboardImages[]`.
2. Confirm `desktopChatSendPayloadRuntime.ts` keeps the image after normalization.
3. Confirm `DesktopLiveTurnRuntimeClient.sendQuery` payload includes `clipboard_image` resources.
4. Confirm `DefaultTurnResourceResolvers` materializes the image into `screenshot_ref` and `screenshot_refs`.
5. Confirm backend query input resolution can load the artifact ref.

### File Chip Appears but Model Does Not See File Text

1. Confirm selected file is in `readableFiles[]`, not `clipboardImages[]`.
2. Confirm `DesktopChatSendPreparationRuntime` submitted a `readable_file` resource.
3. Confirm `DefaultTurnResourceResolvers` called the local-runtime `read_file` tool.
4. Confirm successful `output` was added to `attachment_context` before backend transport.
5. Confirm the visible transcript row only stores filename metadata.

### Replay Loses Attachment Images

1. Confirm the original user row stored typed `attachments[]`, or old `screenshotRef`, `screenshotUrl`, or `screenshot_refs` metadata.
2. Confirm transcript persistence retained those fields.
3. Confirm `legacyVisualAttachmentReplayAdapter` adapts old refs into typed descriptors.
4. Confirm `desktopAttachmentImageRuntime.js` can fetch the artifact-backed attachment source.
5. Confirm backend artifact fetch route still serves the ref.

## Review Checklist

- Attachment-only sends still work.
- Pasted and selected image files share the same sender contract.
- Readable files do not leak raw content into visible chat rows.
- `screenshot_ref` and `screenshot_refs` stay compatible.
- Artifact upload failure keeps an inline fallback where supported.
- Query payload, SDK display row, transcript row, and replay target row carry
  compatible attachment metadata; renderer pending rows carry no attachment
  metadata and do not own visual attachment descriptors or display attachment
  ids.
- Tests cover both the producer and downstream consumer for any changed field.

## Related Docs

- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](presentation/data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Artifact Change Workflow](../../../desktop/artifact_change_workflow.md)
- [Artifacts and Attachments](../../../desktop/artifacts_and_attachments.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Transcript Replay Change Workflow](../../../memory/transcript_replay_change_workflow.md)
