---
summary: "Legacy screenshot metadata and SDK typed attachment projection reference for explicit screenshotRef/screenshotUrl metadata, screenshot_refs SDK replay input, typed attachments, and removed renderer whole-message screenshot display."
read_when:
  - When changing SDK display attachment projection, artifact image resolution, or replay screenshot metadata.
  - When debugging missing renderer visual attachments, SDK-owned `screenshotRef`/`screenshotUrl` replay input, `screenshot_refs` multi-image projection, or stale screenshot artifact inference behavior.
title: "Screenshot Message State and SDK Projection Reference"
---

# Screenshot Message State and SDK Projection Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts`
- `packages/windie-sdk-js/src/projections/legacyVisualAttachmentReplayAdapter.ts`
- `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx`
- `tests/frontend/ArtifactImageUtils.test.ts`
- `tests/frontend/SdkDisplayChatMessageProjection.test.ts`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/ConversationReplayActions.test.jsx`

## Current Contract

Renderer display rows consume ordered typed `attachments[]`. Legacy screenshot
metadata remains compatibility input for SDK replay/backend provider history.

- `screenshot`: inline image payload only. It may be a `data:image/*;base64,...`
  URL or bare base64 image data.
- `screenshotRef` / `screenshot_ref`: durable artifact id.
- `screenshotUrl` / `screenshot_url`: display URL for a remote artifact image.
- `screenshotRefs` / `screenshot_refs`: ordered multi-image artifact ids,
  adapted by the SDK replay adapter into ordered typed `attachments[]`.

Do not reintroduce the retired compatibility path that treats a non-inline
`screenshot` string as an artifact id. Remote screenshots require explicit
`screenshotRef`, `screenshotUrl`, or `screenshot_refs` metadata.

URL-to-ref extraction from backend artifact URLs such as `/api/artifacts/<id>`
is limited to artifact image utilities and SDK/store compatibility adapters.
Renderer replay actions must not perform that inference or forward inferred
`screenshot_ref`/`screenshot_url` fields; replay resource preservation comes
from the SDK target display row.

## Runtime Behavior

The old renderer `screenshotMessageState.js` helper has been removed from the
production path. Replay-specific screenshot alias recovery belongs in SDK
display-row compatibility adapters, not renderer replay actions or renderer
screenshot state. Renderer feature code should render image descriptors through
`AttachmentList`/`AttachmentRendererRegistry`; those components resolve ready
artifact-backed images with
`DesktopAttachmentImageRuntime.useResolvedAttachmentImageSrc`.
`UserMessage` must not render `attachmentFilenames[]` as a separate visible
fallback; filename metadata is compatibility/context data until the SDK display
row provides typed `attachments[]`.

There is no renderer `buildMessageScreenshotState(...)` whole-message facade.
Renderer chat rows should receive typed `attachments[]`; artifact-backed image
resolution stays behind attachment descriptors.
`AttachmentRendererRegistry` does not keep a renderer-side last image source
while SDK attachment lifecycle changes. A materializing preview renders only
while the descriptor remains `status: "materializing"`, and a ready image
renders only after the artifact/image resolver returns a source for the current
SDK descriptor.

There is no renderer `resolveReplayScreenshotState(...)` facade. React replay
actions dispatch SDK retry/edit intent only; SDK target-row resolution preserves
typed attachments and any legacy screenshot refs.

## SDK Display Projection

`DesktopSdkDisplayChatMessageProjectionRuntime` maps SDK display rows directly
to renderer chat-message props and reads typed attachment descriptors from SDK
display row metadata. The legacy `sdkDisplayChatMessageProjection.ts`
compatibility re-export has been deleted; callers use the app-runtime owner
directly. The runtime does not build an
intermediate `DisplayMessage` model or adapt legacy screenshot aliases for
primary renderer display; old rows must be adapted earlier by
`legacyVisualAttachmentReplayAdapter`.
Streaming assistant rows read SDK `reasoningText` only; the renderer adapter
does not recover old snake-case reasoning aliases. The adapter also does not
relabel streaming SDK assistant display rows as `assistant_delta`: it preserves
exact SDK-authored `metadata.sourceEventType` when present, otherwise uses the
generic display row type. Padded or empty source event values fall back to the
row type instead of being trimmed into authored metadata. Renderer completion
derives only from `row.isStreaming`.
It also must not synthesize missing model-facing tool-call objects from
metadata-only rows; SDK display rows should provide that semantic object when
it is part of the row contract, and renderer projection keeps metadata as
display/details only.
`DesktopSdkDisplayAttachmentProjection` owns renderer-side display attachment
validation and artifact image-source extraction for typed SDK descriptors. It
does not publish image-count, ready-image, or lifecycle summary helpers. Token
estimates read only the projected SDK `attachments[]` list; legacy screenshot
arrays remain SDK/replay compatibility input, not a renderer token-count source.
Renderer message content-kind and row-class helpers also route attachment
presence through this projection helper instead of inspecting raw attachment
arrays, so padded or malformed descriptors cannot become attachment UI state.
Attachment ids and artifact image-source fields must be exact non-empty SDK
strings; the renderer drops padded or empty ids/refs/URLs instead of trimming
them into valid display inputs. Lifecycle descriptors must also be complete:
materializing images require an exact `previewSrc`, ready images require an
exact `screenshotRef` or `screenshotUrl`, and screenshot-request placeholders
must come from the camera-button source.

- primary display field: `attachments[]`
- backend/replay compatibility input before renderer projection:
  `screenshotRef`, `screenshot_ref`, `screenshotUrl`, `screenshot_url`,
  `screenshotRefs`, and `screenshot_refs`

Projection rules:

- `attachments[]` is the renderer display contract.
- `screenshot_refs` becomes typed `attachments[]` only in the SDK replay
  adapter.
- SDK display projection must not infer renderer visuals from the old
  `screenshot` field.

## Debug Checklist

If a replayed or resumed image is missing:

1. inspect the SDK display row metadata for `attachments[]`
2. if the stored row is old, confirm `legacyVisualAttachmentReplayAdapter`
   converted `screenshotRef`, `screenshotUrl`, or `screenshot_refs`
3. confirm `screenshot` is not being used as renderer display input
4. check `AttachmentList` / `AttachmentRendererRegistry` for descriptor state
5. check `desktopAttachmentImageRuntime.js` fetch/cache behavior for remote
   artifact URLs

If the missing image was sent from the chat pill while the dashboard still shows
the earlier pending user row, enable `[LiveSurfaceTrace]` and check
`renderer.display_rows.projected`. The renderer-side display adapter should
project only typed SDK `attachments[]`; compatibility screenshot metadata must
already have been adapted by the SDK replay adapter or SDK display projection.

If a row shows one image instead of multiple:

1. confirm SDK display metadata has `attachments[]` with all artifact ids
2. if the row is old, confirm the replay adapter saw every `screenshot_refs`
   value in order
3. verify downstream message rendering consumes `attachments[]`, not
   compatibility aliases

## Related Pages

- [Frontend Renderer Transcript Docs Hub](README.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)
- [Chat Attachment Change Workflow](../chat/chat_attachment_change_workflow.md)
- [Artifacts and Attachments](../../../desktop/artifacts_and_attachments.md)
- [Frontend Capture, Artifact URL, and Payload Normalization Reference](../infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
